"""Orchestrator service — FR-5. THE single chat entry's brain.

Runs the deterministic pre-router (FR-0.3), calls agents as needed (agents
never call each other — only this module coordinates them, AGENTS.md §4.3),
persists results, and enqueues WorldEvents — every chat turn is ONE
transaction: mutations + their events commit together (§5.3).

Routing behavior:
- DIRECT_ZONE (FR-0.1): exactly one agent acts, NEVER a tour offer.
- BIG_TASK (FR-0.2): planner → persist plan + roadmap → narrate + tour_offer
  (OFFERED, never forced, §1).
- NARRATE (unclassified chitchat): a warm line, nothing else.
"""

import uuid

from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession

from app import models as m
from app import schemas as s
from app.agents.orchestrator.router import Route, Zone, route_message
from app.agents.scheduler.planner import PlanRequest
from app.agents.scheduler.service import create_plan
from app.services import outbox
from app.services.world_state import list_today_decks


class ChatRequest(s.ContractModel):
    """POST /api/chat body (§5.2)."""

    message: str = Field(min_length=1)


class ChatResponse(s.ContractModel):
    """Ack + what happened (§5.2: "ack + enqueues events")."""

    ack: str
    route: str  # "direct_zone:<zone>" | "big_task" | "narrate"
    plan: s.StudyPlan | None
    roadmap_id: str | None


_CHITCHAT_REPLY = (
    "Hello, welcome back to your harbour. Tell me what you're studying, "
    "or name a place — fishboat, small boats, atlas, or lamp."
)

_ZONE_NARRATION = {
    Zone.SMALL_BOAT: (
        "The small boats are your flashcard decks — the ones circling "
        "the lamp are ready for you today."
    ),
    Zone.UNDERWATER: (
        "Diving down to your knowledge atlas — every concept you've "
        "captured, connected."
    ),
    Zone.LAMP: (
        "Here is your lamp — every victory it's kept for you, glowing "
        "a little warmer each time."
    ),
}


def build_roadmap(plan: s.StudyPlan, roadmap_id: str | None = None) -> s.Roadmap:
    """FR-5.3 — deterministic ordered tour script for a new big task.

    camera_preset note: the frozen CameraPreset union has no "lamp" member;
    the lamp step targets "lamp" with the "overview" preset (documented for
    the monitor — the world layer reaches the lamp via the target).
    """
    return s.Roadmap(
        id=roadmap_id or f"road-{uuid.uuid4().hex[:8]}",
        plan_id=plan.id,
        steps=[
            s.RoadmapStep(
                target="fishboat",
                narration=(
                    f"This is your fishboat. {plan.empathy_line} "
                    "Today's plan lives here, one small task at a time."
                ),
                camera_preset="fishboat",
            ),
            s.RoadmapStep(
                target="fleet",
                narration=(
                    "The small boats are your flashcard decks. "
                    "The ones circling the lamp are ready for you today."
                ),
                camera_preset="fleet",
            ),
            s.RoadmapStep(
                target="underwater",
                narration=(
                    "Below the surface is your knowledge atlas — "
                    "everything you've learned, connected and glowing."
                ),
                camera_preset="underwater",
            ),
            s.RoadmapStep(
                target="lamp",
                narration=(
                    "And the lamp keeps your victories. "
                    "Every finished step lights it a little more."
                ),
                camera_preset="overview",
            ),
        ],
    )


async def _persist_roadmap(
    session: AsyncSession, user: m.User, roadmap: s.Roadmap
) -> None:
    session.add(
        m.Roadmap(
            id=roadmap.id,
            user_id=user.id,
            plan_id=roadmap.plan_id,
            steps=[step.model_dump(mode="json", by_alias=True) for step in roadmap.steps],
        )
    )


async def handle_chat(
    session: AsyncSession, user: m.User, message: str
) -> ChatResponse:
    """One chat turn: route → act → persist → events. Caller commits."""
    decision = route_message(message)

    if decision.route is Route.NARRATE:
        await outbox.emit(session, user.id, [outbox.narrate(_CHITCHAT_REPLY)])
        return ChatResponse(
            ack=_CHITCHAT_REPLY, route="narrate", plan=None, roadmap_id=None
        )

    if decision.route is Route.BIG_TASK:
        plan = await create_plan(session, user, PlanRequest(input=message))
        roadmap = build_roadmap(plan)
        await _persist_roadmap(session, user, roadmap)
        await outbox.emit(
            session,
            user.id,
            [outbox.narrate(plan.empathy_line), outbox.tour_offer(roadmap.id)],
        )
        return ChatResponse(
            ack=plan.empathy_line, route="big_task", plan=plan, roadmap_id=roadmap.id
        )

    # DIRECT_ZONE — one agent, never a tour (FR-0.1).
    zone = decision.zone
    if zone is Zone.FISHBOAT:
        plan = await create_plan(session, user, PlanRequest(input=message))
        await outbox.emit(
            session,
            user.id,
            [
                outbox.narrate(plan.empathy_line),
                outbox.camera_fly_to("fishboat", "fishboat"),
                outbox.highlight("fishboat"),
            ],
        )
        return ChatResponse(
            ack=plan.empathy_line,
            route="direct_zone:fishboat",
            plan=plan,
            roadmap_id=None,
        )
    if zone is Zone.SMALL_BOAT:
        due = await list_today_decks(session, user)
        text = (
            _ZONE_NARRATION[zone]
            if due
            else "Nothing is waiting for you right now. Your harbour can rest."
        )
        await outbox.emit(
            session, user.id,
            [outbox.narrate(text), outbox.camera_fly_to("fleet", "fleet")],
        )
        return ChatResponse(
            ack=text,
            route="direct_zone:small_boat",
            plan=None,
            roadmap_id=None,
        )
    if zone is Zone.UNDERWATER:
        await outbox.emit(
            session, user.id,
            [
                outbox.narrate(_ZONE_NARRATION[zone]),
                outbox.camera_fly_to("underwater", "underwater"),
            ],
        )
        return ChatResponse(
            ack=_ZONE_NARRATION[zone],
            route="direct_zone:underwater",
            plan=None,
            roadmap_id=None,
        )
    if zone is Zone.LAMP:
        await outbox.emit(
            session,
            user.id,
            [
                outbox.narrate(_ZONE_NARRATION[zone]),
                outbox.camera_fly_to("lamp", "overview"),
            ],
        )
        return ChatResponse(
            ack=_ZONE_NARRATION[zone],
            route="direct_zone:lamp",
            plan=None,
            roadmap_id=None,
        )
    raise AssertionError(f"unhandled zone {zone}")  # unreachable — fail loudly
