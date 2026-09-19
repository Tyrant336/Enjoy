"""Seed loader — deliberately loads the §4.6 P0 fixtures into PostgreSQL.

THE ONLY place seed data is LOADED (AGENTS.md §2.3). The seed DATA itself is
authored by Agent S in `Backend/scripts/fixtures/seed_data.json` — this
script contains no fixture content. Missing/invalid file = loud crash, never
invented data (§3.4 NO REALITY MODES: seed data is test data, not a mode).

FIXTURE FORMAT (S's canonical file — see its `_meta` for the authoritative
description):
    {
      "_meta":  {…},                    # provenance/convention notes (unused)
      "user":   {"id", "timezone", "prefs"},
      "plan":   {"id","goal","empathyLine","granularity","tasks": […]},
      "decks":  [{"id","name","boatState","cardCount","dueToday","apkgUrl"}],
      "cards":  [{"id","deckId","question","answer","due","fsrsState", …}],
      "graph":  {"nodes": […canonical KGNode…], "links": […canonical KGLink…]},
      "records":[{"id","kind","refId","title","at"}],
      "seedNarration": str              # text of the seeded narrate event
    }

DATES are relative-to-now TOKENS ("NOW-3d", "TODAY+1d", …) resolved at
seed-run against the real clock by `scripts/seed_dates.py` — THE one resolver
(AGENTS.md §3.1); this loader never parses dates itself.

`decks[].cardCount/dueToday` are the fixture author's display metadata; the
API always computes both live (app/services/world_state.py) — they are
validated as ints here (schema documentation) but never written to the DB.

IDEMPOTENCY: **wipe + re-seed the fixture user.** Every run deletes ALL rows
owned by `user.id` (FK-safe order) and re-inserts from the fixture. Other
users' rows are untouched. Safe to run any number of times.

Run (from Backend/):  .venv/Scripts/python.exe -m scripts.seed
"""

import asyncio
import json
import sys
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from pydantic import ConfigDict, Field
from sqlalchemy import delete, func, select

from app import models as m
from app.core.db import get_session_factory
from app.schemas import (
    BoatState,
    ContractModel,
    DeckRequest,
    FsrsState,
    KGEdgeType,
    KGNodeType,
    RecordKind,
    TaskStatus,
)
from scripts.seed_dates import resolve_fixture

FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "seed_data.json"

# Fixed id of the seeded narrate WorldEvent (seq=1) that powers the SSE stub.
SEED_EVENT_ID = "evt-seed-narrate-01"


# ── Fixture schema (validation at the boundary — AGENTS.md §2.4) ─────────────
# Fixture-only models; canonical API shapes are reused from app.schemas.
# Date tokens are already resolved to real date/datetime values by
# resolve_fixture() before these models see the data.


class FixtureModel(ContractModel):
    model_config = ConfigDict(extra="forbid")


class FixtureUser(FixtureModel):
    id: str
    timezone: str  # validated as a real IANA name at load time
    prefs: dict[str, object] = Field(default_factory=dict)


class FixtureTask(FixtureModel):
    id: str
    title: str
    description: str
    estimate_minutes: int = Field(le=45)  # FR-1.1: obviously finishable
    difficulty: int = Field(ge=1, le=5)
    status: TaskStatus
    scheduled_for: date | None
    slot: str | None
    depends_on: list[str] = Field(default_factory=list)
    deck_request: DeckRequest | None = None
    world_label: str | None = None


class FixturePlan(FixtureModel):
    id: str
    goal: str
    empathy_line: str
    granularity: int = Field(ge=1, le=5)
    tasks: list[FixtureTask]


class FixtureCard(FixtureModel):
    id: str
    deck_id: str
    question: str
    answer: str
    due: datetime
    fsrs_state: FsrsState
    source_snippet: str | None = Field(default=None, max_length=200)  # §4.5


class FixtureDeck(FixtureModel):
    id: str
    name: str
    boat_state: BoatState
    apkg_url: str | None = None
    # Fixture author's display metadata — validated, never loaded (the API
    # computes both live; see module docstring).
    card_count: int | None = None
    due_today: int | None = None


class FixtureKGNode(FixtureModel):
    id: str
    label: str
    type: KGNodeType
    cluster_id: str
    gloss: str
    deck_ids: list[str] = Field(default_factory=list)
    task_ids: list[str] = Field(default_factory=list)


class FixtureKGLink(FixtureModel):
    source: str
    target: str
    type: KGEdgeType


class FixtureGraph(FixtureModel):
    nodes: list[FixtureKGNode]
    links: list[FixtureKGLink]


class FixtureRecord(FixtureModel):
    id: str
    kind: RecordKind
    ref_id: str
    title: str
    at: datetime


class SeedFixture(FixtureModel):
    meta: dict[str, object] = Field(default_factory=dict, alias="_meta")
    user: FixtureUser
    plan: FixturePlan
    decks: list[FixtureDeck]
    cards: list[FixtureCard]
    graph: FixtureGraph
    records: list[FixtureRecord]
    seed_narration: str


def load_fixture(path: Path = FIXTURE_PATH) -> SeedFixture:
    """Read + resolve + validate the fixture file. Loud crash if missing or
    invalid — never invent fixture data (the DATA file is Agent S's)."""
    if not path.is_file():
        raise SystemExit(
            f"SEED FIXTURE MISSING: {path}\n"
            "The canonical §4.6 fixture (Backend/scripts/fixtures/seed_data.json) "
            "is authored by Agent S. The loader does NOT invent fixture data. "
            "Re-run once the fixture file has landed."
        )
    raw = json.loads(path.read_text(encoding="utf-8"))
    resolved = resolve_fixture(raw)  # tokens → real dates, one instant for all
    fixture = SeedFixture.model_validate(resolved)  # ValidationError = loud
    ZoneInfo(fixture.user.timezone)  # raises ZoneInfoNotFoundError if not IANA

    # Cross-reference checks — fail loudly on orphaned references (§2).
    deck_ids = {d.id for d in fixture.decks}
    for card in fixture.cards:
        if card.deck_id not in deck_ids:
            raise ValueError(
                f"Fixture card {card.id!r} references unknown deck {card.deck_id!r}"
            )
    node_ids = {n.id for n in fixture.graph.nodes}
    for link in fixture.graph.links:
        for endpoint in (link.source, link.target):
            if endpoint not in node_ids:
                raise ValueError(
                    f"Fixture link references unknown node {endpoint!r}: {link}"
                )
    return fixture


# ── Loader ───────────────────────────────────────────────────────────────────

# FK-safe wipe order (children before parents). `users` is handled
# separately below — its scoping column is `id`, not `user_id`.
_WIPE_ORDER = (
    m.ReviewEvent,
    m.EventOutbox,
    m.KGEdge,
    m.KGNode,
    m.Record,
    m.Roadmap,
    m.Flashcard,
    m.Deck,
    m.StudyTask,
    m.StudyPlan,
)


async def seed(fixture: SeedFixture) -> dict[str, int]:
    """Wipe + re-seed the fixture user in ONE transaction. Returns row counts.

    Inserts flush in FK-dependency tiers: SQLAlchemy's unit of work orders
    flushes by relationship() dependencies only — plain table-level FKs do
    NOT order inserts (verified empirically on 2.0.36, session 013) — so the
    tiers below are explicit. Everything still commits atomically at the end.
    """
    user_id = fixture.user.id

    async with get_session_factory()() as session, session.begin():
        for table in _WIPE_ORDER:
            await session.execute(delete(table).where(table.user_id == user_id))
        await session.execute(delete(m.User).where(m.User.id == user_id))

        # Tier 1: the user (everything else FKs to it).
        session.add(
            m.User(id=user_id, timezone=fixture.user.timezone, prefs=fixture.user.prefs)
        )
        await session.flush()

        # Tier 2: plan (tasks FK to it).
        plan = fixture.plan
        session.add(
            m.StudyPlan(
                id=plan.id,
                user_id=user_id,
                goal=plan.goal,
                empathy_line=plan.empathy_line,
                granularity=plan.granularity,
            )
        )
        await session.flush()
        # Tier 3: tasks (FK plan) + decks (cards FK to them).
        for t in plan.tasks:
            session.add(
                m.StudyTask(
                    id=t.id,
                    plan_id=plan.id,
                    user_id=user_id,
                    title=t.title,
                    description=t.description,
                    estimate_minutes=t.estimate_minutes,
                    difficulty=t.difficulty,
                    status=t.status,
                    scheduled_for=t.scheduled_for,
                    slot=t.slot,
                    depends_on=t.depends_on,
                    deck_request=(
                        None
                        if t.deck_request is None
                        else t.deck_request.model_dump(by_alias=True)
                    ),
                    world_label=t.world_label,
                )
            )

        for deck in fixture.decks:
            session.add(
                m.Deck(
                    id=deck.id,
                    user_id=user_id,
                    name=deck.name,
                    boat_state=deck.boat_state,
                    apkg_url=deck.apkg_url,
                )
            )
        await session.flush()

        # Tier 4: cards (FK deck) + user-scoped rows with no further FKs.
        for c in fixture.cards:
            session.add(
                m.Flashcard(
                    id=c.id,
                    deck_id=c.deck_id,
                    user_id=user_id,
                    question=c.question,
                    answer=c.answer,
                    due=c.due,
                    fsrs=c.fsrs_state.model_dump(by_alias=True),
                    source_snippet=c.source_snippet,
                )
            )

        for n in fixture.graph.nodes:
            session.add(
                m.KGNode(
                    id=n.id,
                    user_id=user_id,
                    label=n.label,
                    cluster_id=n.cluster_id,
                    data={
                        "type": n.type,
                        "gloss": n.gloss,
                        "deckIds": n.deck_ids,
                        "taskIds": n.task_ids,
                    },
                )
            )
        for link in fixture.graph.links:
            session.add(
                m.KGEdge(
                    user_id=user_id,
                    source=link.source,
                    target=link.target,
                    type=link.type,
                    data={},
                )
            )

        for r in fixture.records:
            session.add(
                m.Record(
                    id=r.id,
                    user_id=user_id,
                    kind=r.kind,
                    ref_id=r.ref_id,
                    title=r.title,
                    at=r.at,
                )
            )

        # Seeded narrate WorldEvent (seq=1) so the SSE stub has something to
        # stream (REQUIREMENTS §5.3 — payload is the full WorldEvent JSON).
        session.add(
            m.EventOutbox(
                user_id=user_id,
                seq=1,
                type="narrate",
                payload={
                    "id": SEED_EVENT_ID,
                    "seq": 1,
                    "type": "narrate",
                    "text": fixture.seed_narration,
                },
            )
        )

    return {
        "tasks": len(plan.tasks),
        "decks": len(fixture.decks),
        "cards": len(fixture.cards),
        "kg_nodes": len(fixture.graph.nodes),
        "kg_edges": len(fixture.graph.links),
        "records": len(fixture.records),
        "events": 1,
    }


async def main() -> None:
    fixture = load_fixture()
    counts = await seed(fixture)

    # Verify-by-reading-back (AGENTS.md §1.2 — never claim without checking).
    user_id = fixture.user.id
    async with get_session_factory()() as session:
        outbox_count = (
            await session.execute(
                select(func.count())
                .select_from(m.EventOutbox)
                .where(m.EventOutbox.user_id == user_id)
            )
        ).scalar_one()

    print(f"Seeded user: {user_id} (timezone {fixture.user.timezone})")
    for name, count in counts.items():
        print(f"  {name}: {count}")
    print(f"  event_outbox rows (verified in DB): {outbox_count}")
    print("Seed complete (wipe + re-seed of the fixture user; idempotent).")


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
