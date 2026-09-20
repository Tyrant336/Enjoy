"""World-state assembly — queries Postgres and builds the frozen §5 contracts.

Pure read logic, one path (AGENTS.md §3). Every row is parsed into the
Pydantic contracts in app/schemas.py at this boundary (§2.4).

Deterministic decisions locked here (documented for the monitor):
- `due_today` (per deck): cards whose `due` instant is on or before the END of
  the user's current LOCAL day (user's IANA timezone, FR-4.2). Overdue cards
  count as due. Drives today's circle (FR-2.4) via dueToday > 0.
- `boat_state`: read from the `decks` row (the seed/mutations own it); the
  dueToday number is always computed live from `flashcards.due`.
- `lamp_glow_level`: min(1.0, record_count * 0.1) — increases with record
  count, capped, subtle (FR-4.4).
- `active_plan`: the user's most recently created study plan.
- `graph_summary.updated_at`: null — migration 001 kg tables carry no
  timestamp column and we do not invent one (contract allows null).
- Journal timeline order: newest record first.
- `pending_tour` (Phase 2): derived from the event log — the latest
  `tour_offer` with no later `tour_start`/`tour_end` for that roadmap.
- `reviewing` (Phase 2): the deck whose boatState is "reviewing" (set/
  restored by the review service), currentCard from the ONE session
  derivation (services/review_session.py). answerRevealed rebuilds as false
  — the answer is re-revealable via REST (documented).
"""

from datetime import UTC, datetime, time, timedelta
from typing import cast
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models as m
from app import schemas as s
from app.core.errors import AppError
from app.services.review_session import card_schema, session_state

# FR-4.4: each record nudges the lamp; capped at full glow.
LAMP_GLOW_PER_RECORD = 0.1


def _end_of_local_today(now_utc: datetime, timezone: str) -> datetime:
    """The UTC instant of the next local midnight — the 'due today' horizon."""
    tz = ZoneInfo(timezone)
    local_today = now_utc.astimezone(tz).date()
    next_midnight = datetime.combine(local_today + timedelta(days=1), time.min, tz)
    return next_midnight.astimezone(UTC)


def task_schema(t: m.StudyTask) -> s.StudyTask:
    """THE one ORM→contract mapping for StudyTask (reused by scheduler service)."""
    return s.StudyTask(
        id=t.id,
        title=t.title,
        description=t.description,
        estimate_minutes=t.estimate_minutes,
        difficulty=t.difficulty,
        status=cast(s.TaskStatus, t.status),  # writers are Literal-checked
        scheduled_for=t.scheduled_for,
        slot=t.slot,
        depends_on=[str(dep) for dep in t.depends_on],
        deck_request=(
            None
            if t.deck_request is None
            else s.DeckRequest.model_validate(t.deck_request)
        ),
        world_label=t.world_label,
    )


def world_user_schema(user: m.User) -> s.WorldUser:
    """THE one ORM→contract mapping for the user's prefs (reused by
    PUT /api/preferences; §5.2).

    Product defaults for prefs never set yet (not fallbacks hiding a broken
    upstream — the user simply hasn't chosen; §7.4 toggle).
    """
    prefs = user.prefs
    return s.WorldUser(
        timezone=user.timezone,
        labels_visible=bool(prefs.get("labelsVisible", True)),
        reduced_motion=bool(prefs.get("reducedMotion", False)),
    )


def record_schema(r: m.Record) -> s.Record:
    """THE one ORM→contract mapping for Record (reused by scheduler/review)."""
    return s.Record(
        id=r.id,
        kind=cast(s.RecordKind, r.kind),  # writers are Literal-checked
        ref_id=r.ref_id,
        title=r.title,
        at=r.at,
    )


def _plan_schema(plan: m.StudyPlan, tasks: list[m.StudyTask]) -> s.StudyPlan:
    return s.StudyPlan(
        id=plan.id,
        goal=plan.goal,
        empathy_line=plan.empathy_line,
        granularity=plan.granularity,
        tasks=[task_schema(t) for t in tasks],
    )


async def _deck_schemas(session: AsyncSession, user: m.User) -> list[s.Deck]:
    """All of the user's decks with live cardCount/dueToday (FR-2.4)."""
    now = datetime.now(UTC)
    due_horizon = _end_of_local_today(now, user.timezone)

    decks = (
        (
            await session.execute(
                select(m.Deck)
                .where(m.Deck.user_id == user.id)
                .order_by(m.Deck.created_at, m.Deck.id)
            )
        )
        .scalars()
        .all()
    )
    counts = (
        await session.execute(
            select(m.Flashcard.deck_id, func.count())
            .where(m.Flashcard.user_id == user.id)
            .group_by(m.Flashcard.deck_id)
        )
    ).all()
    due_counts = (
        await session.execute(
            select(m.Flashcard.deck_id, func.count())
            .where(m.Flashcard.user_id == user.id, m.Flashcard.due <= due_horizon)
            .group_by(m.Flashcard.deck_id)
        )
    ).all()
    card_count_by_deck = {deck_id: n for deck_id, n in counts}
    due_by_deck = {deck_id: n for deck_id, n in due_counts}

    return [
        s.Deck(
            id=deck.id,
            name=deck.name,
            boat_state=cast(s.BoatState, deck.boat_state),  # writers Literal-checked
            card_count=card_count_by_deck.get(deck.id, 0),
            due_today=due_by_deck.get(deck.id, 0),
            apkg_url=deck.apkg_url,
        )
        for deck in decks
    ]


async def list_today_decks(session: AsyncSession, user: m.User) -> list[s.Deck]:
    """Decks with dueToday > 0 — today's review queue; drives the circle."""
    return [deck for deck in await _deck_schemas(session, user) if deck.due_today > 0]


async def list_records(session: AsyncSession, user: m.User) -> list[s.Record]:
    """Journal timeline (FR-4.3), newest first."""
    rows = (
        (
            await session.execute(
                select(m.Record)
                .where(m.Record.user_id == user.id)
                .order_by(m.Record.at.desc(), m.Record.id)
            )
        )
        .scalars()
        .all()
    )
    return [record_schema(r) for r in rows]


async def build_kg_graph(session: AsyncSession, user: m.User) -> s.KnowledgeGraph:
    """Canonical KnowledgeGraph (§5.1) from kg_nodes/kg_edges (FR-3.3)."""
    node_rows = (
        (
            await session.execute(
                select(m.KGNode)
                .where(m.KGNode.user_id == user.id)
                .order_by(m.KGNode.id)
            )
        )
        .scalars()
        .all()
    )
    edge_rows = (
        (
            await session.execute(
                select(m.KGEdge)
                .where(m.KGEdge.user_id == user.id)
                .order_by(m.KGEdge.id)
            )
        )
        .scalars()
        .all()
    )
    return s.KnowledgeGraph(
        nodes=[
            # Column fields + JSONB `data` reassemble the canonical node;
            # model_validate is the boundary check (§2.4).
            s.KGNode.model_validate(
                {
                    "id": n.id,
                    "label": n.label,
                    "clusterId": n.cluster_id,
                    **n.data,
                }
            )
            for n in node_rows
        ],
        links=[
            s.KGLink.model_validate(
                {"source": e.source, "target": e.target, "type": e.type}
            )
            for e in edge_rows
        ],
    )


async def _pending_tour(session: AsyncSession, user: m.User) -> s.PendingTour | None:
    """Latest tour_offer with no later tour_start/tour_end for that roadmap."""
    rows = (
        (
            await session.execute(
                select(m.EventOutbox)
                .where(
                    m.EventOutbox.user_id == user.id,
                    m.EventOutbox.type.in_(["tour_offer", "tour_start", "tour_end"]),
                )
                .order_by(m.EventOutbox.seq)
            )
        )
        .scalars()
        .all()
    )
    pending_id: str | None = None
    for row in rows:
        if row.type == "tour_offer":
            pending_id = str(row.payload.get("roadmapId"))
        elif row.type == "tour_start":
            roadmap = row.payload.get("roadmap")
            if (
                pending_id
                and isinstance(roadmap, dict)
                and roadmap.get("id") == pending_id
            ):
                pending_id = None
        elif row.type == "tour_end":
            pending_id = None
    if pending_id is None:
        return None
    roadmap_row = (
        await session.execute(
            select(m.Roadmap).where(
                m.Roadmap.id == pending_id, m.Roadmap.user_id == user.id
            )
        )
    ).scalar_one_or_none()
    if roadmap_row is None:
        # An offer referencing a roadmap we never persisted is a data bug —
        # fail loudly, never silently drop the tour (AGENTS.md §2).
        raise AppError(
            500,
            "ROADMAP_MISSING",
            "A tour offer points at a roadmap that does not exist.",
            detail={"roadmapId": pending_id},
            recoverable=False,
        )
    if roadmap_row.plan_id is None:
        raise AppError(
            500,
            "ROADMAP_MISSING",
            "A tour roadmap has no plan reference.",
            detail={"roadmapId": pending_id},
            recoverable=False,
        )
    return s.PendingTour(
        roadmap_id=roadmap_row.id,
        roadmap=s.Roadmap(
            id=roadmap_row.id,
            plan_id=roadmap_row.plan_id,
            steps=[s.RoadmapStep.model_validate(st) for st in roadmap_row.steps],
        ),
    )


async def _reviewing(session: AsyncSession, user: m.User) -> s.ReviewingState | None:
    """The deck currently in review POV (boatState "reviewing"), if any."""
    deck = (
        (
            await session.execute(
                select(m.Deck)
                .where(m.Deck.user_id == user.id, m.Deck.boat_state == "reviewing")
                .order_by(m.Deck.created_at.desc(), m.Deck.id)
                .limit(1)
            )
        )
        .scalars()
        .first()
    )
    if deck is None:
        return None
    state = await session_state(session, user.id, deck.id, datetime.now(UTC))
    return s.ReviewingState(
        deck_id=deck.id,
        current_card=card_schema(state.remaining[0]) if state.remaining else None,
        answer_revealed=False,
    )


async def build_world_state(session: AsyncSession, user: m.User) -> s.WorldState:
    """The canonical WorldState (§5.2) the FE Zustand projection rebuilds from."""
    plan_row = (
        (
            await session.execute(
                select(m.StudyPlan)
                .where(m.StudyPlan.user_id == user.id)
                .order_by(m.StudyPlan.created_at.desc(), m.StudyPlan.id)
                .limit(1)
            )
        )
        .scalars()
        .first()
    )
    active_plan: s.StudyPlan | None = None
    if plan_row is not None:
        task_rows = (
            (
                await session.execute(
                    select(m.StudyTask)
                    .where(m.StudyTask.plan_id == plan_row.id)
                    .order_by(m.StudyTask.created_at, m.StudyTask.id)
                )
            )
            .scalars()
            .all()
        )
        active_plan = _plan_schema(plan_row, list(task_rows))

    records = await list_records(session, user)
    decks = await _deck_schemas(session, user)

    node_count = (
        await session.execute(
            select(func.count())
            .select_from(m.KGNode)
            .where(m.KGNode.user_id == user.id)
        )
    ).scalar_one()
    edge_count = (
        await session.execute(
            select(func.count())
            .select_from(m.KGEdge)
            .where(m.KGEdge.user_id == user.id)
        )
    ).scalar_one()
    last_seq = (
        await session.execute(
            select(func.coalesce(func.max(m.EventOutbox.seq), 0)).where(
                m.EventOutbox.user_id == user.id
            )
        )
    ).scalar_one()

    return s.WorldState(
        user=world_user_schema(user),
        active_plan=active_plan,
        decks=decks,
        reviewing=await _reviewing(session, user),
        records=records,
        graph_summary=s.GraphSummary(
            node_count=node_count, edge_count=edge_count, updated_at=None
        ),
        lamp_glow_level=min(1.0, len(records) * LAMP_GLOW_PER_RECORD),
        pending_tour=await _pending_tour(session, user),
        last_event_seq=last_seq,
    )
