"""Orchestrator service — FR-5. THE single chat entry's brain.

ONE LangGraph graph (FR-0.3, handoff §3.4):

    route ──(ambiguous)──► supervisor ──► act ──► END
      │  (deterministic pre-router,    ▲
      │   FR-0.3)                      │ LLM fallback ONLY for the
      └──(clear)───────────────────────┘ ambiguous case — never a
                                         second router, never a
                                         config branch (§3.2/§3.4)

`act` executes the decision: agents are called ONLY from here (agents never
call each other, AGENTS.md §4.3), results persist, WorldEvents enqueue —
every chat turn is ONE transaction: mutations + their events commit together
(§5.3). LLM failures (LLMError) propagate to the API layer, which returns the
§5.2 envelope + SSE `error` — never canned content (§3.4).

Routing behavior:
- DIRECT_ZONE (FR-0.1): exactly one agent acts, NEVER a tour offer.
- BIG_TASK (FR-0.2): planner → persist plan + roadmap → narrate + tour_offer
  (OFFERED, never forced, §1). Roadmap narration is LLM-generated (FR-5.3 P1).
- NARRATE (unclassified chitchat): a warm line, nothing else.
"""

import logging
import re
import uuid
from typing import Literal, TypedDict, cast

from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph
from pydantic import Field, model_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app import models as m
from app import schemas as s
from app.agents.orchestrator.router import (
    Route,
    RouteDecision,
    Zone,
    analyze_message,
)
from app.agents.scheduler.planner import PlanRequest
from app.agents.scheduler.service import create_plan
from app.core import llm
from app.services import outbox
from app.services.world_state import list_today_decks

logger = logging.getLogger("enjoy.orchestrator")


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


# ── supervisor (the LLM fallback node — ambiguous messages only) ──────────────


class SupervisorDecision(s.ContractModel):
    """LLM output of the supervisor node (FR-0.3 fallback)."""

    route: Literal["big_task", "direct_zone", "narrate"]
    zone: Literal["fishboat", "small_boat", "underwater", "lamp"] | None = None
    reason: str = Field(min_length=1, max_length=300)

    @model_validator(mode="after")
    def _zone_consistency(self) -> "SupervisorDecision":
        # direct_zone REQUIRES a zone. The reverse is a hint, not an error:
        # real models reasonably attach the mentioned zone to a big_task
        # (live eval C08, session 026) — `_supervise` drops it with a log
        # line because the big-task pipeline touches every zone anyway.
        if self.route == "direct_zone" and self.zone is None:
            raise ValueError("direct_zone requires a zone")
        return self


_SUPERVISOR_SYSTEM = """\
You are the routing supervisor of a calm study app shaped like a harbour. \
A cheap keyword router could not confidently classify the student's message. \
Decide the ONE route:

- "big_task": the message names a learning goal/topic, asks for a plan or \
schedule without aiming at a specific zone, or expresses overwhelm about \
studying. The full pipeline runs and a tour is OFFERED.
- "direct_zone": the message aims at one place/agent. Zones: \
fishboat (schedule/planner), small_boat (flashcards/decks/review), \
underwater (knowledge atlas), lamp (journal/records).
- "narrate": pure chitchat with no learning intent.

PRECEDENCE RULE (FR-0.2): when a message names ONE zone and the rest of it \
just describes that zone's own function (scheduling for fishboat, \
reviewing/drilling decks for small_boat, …), it stays direct_zone — e.g. \
"fishboat, schedule my revision week" is direct_zone:fishboat. But when the \
message ALSO names a separate learning goal/topic the zone alone would \
ignore ("help me understand photosynthesis and drill my flashcards"), the \
learning goal must never be dropped → big_task.

Never invent a goal the student did not state. Reply via the schema only."""

_ZONE_BY_VALUE = {zone.value: zone for zone in Zone}


async def _supervise(message: str, current: RouteDecision) -> RouteDecision:
    """LLM supervisor fallback. Schema mismatch/invalid combos → LLMError."""
    decision = await llm.structured(
        SupervisorDecision,
        system=_SUPERVISOR_SYSTEM,
        user=(
            f"Message: {message}\n"
            f"Keyword router's best guess: {current.route.value}"
            + (f" ({current.zone.value})" if current.zone else "")
        ),
        temperature=0.0,
    )
    logger.info(
        "supervisor: %r → %s (zone=%s) because %s",
        message, decision.route, decision.zone, decision.reason,
    )
    route = Route(decision.route)
    if route is not Route.DIRECT_ZONE and decision.zone is not None:
        logger.info(
            "supervisor zone hint %s dropped for %s (the pipeline covers all zones)",
            decision.zone, route.value,
        )
    zone = (
        _ZONE_BY_VALUE[decision.zone]
        if route is Route.DIRECT_ZONE and decision.zone
        else None
    )
    return RouteDecision(route, zone)


# ── roadmap (FR-5.3) — deterministic tour spine, LLM narration (P1) ──────────

_ROADMAP_SPINE: tuple[tuple[str, s.CameraPreset], ...] = (
    ("fishboat", "fishboat"),
    ("fleet", "fleet"),
    ("underwater", "underwater"),
    # camera_preset note: the frozen CameraPreset union has no "lamp" member;
    # the lamp step targets "lamp" with the "overview" preset (documented for
    # the monitor — the world layer reaches the lamp via the target).
    ("lamp", "overview"),
)


class RoadmapNarration(s.ContractModel):
    """LLM narration for the roadmap's fixed steps (FR-5.3 P1)."""

    narrations: list[str] = Field(
        min_length=len(_ROADMAP_SPINE), max_length=len(_ROADMAP_SPINE)
    )


def _sentence_count(text: str) -> int:
    return len([part for part in re.split(r"[.!?]+", text) if part.strip()])


async def build_roadmap(plan: s.StudyPlan, roadmap_id: str | None = None) -> s.Roadmap:
    """FR-5.3 P1 — ordered tour script; step narration is LLM-generated
    (≤2 warm sentences each, §7.1 tone, no pressure mechanics §7). Failure is
    a loud LLMError — never canned text (handoff §3.8)."""
    narration = await llm.structured(
        RoadmapNarration,
        system=(
            "You are the narrator of a calm harbour study world. Write exactly "
            "4 narrations, in this exact order, each describing ITS OWN stop: "
            "1) fishboat — the student's new plan; 2) fleet — the flashcard "
            "decks; 3) underwater — the knowledge atlas of connected concepts; "
            "4) lamp — the journal of past victories. Each narration: at most "
            "TWO short warm sentences, gentle, no urgency, no guilt, no streaks."
        ),
        user=(
            f"Goal: {plan.goal}\n"
            f"Empathy line: {plan.empathy_line}\n"
            f"The plan has {len(plan.tasks)} small tasks."
        ),
        temperature=0.7,
    )
    for text in narration.narrations:
        if _sentence_count(text) > 2 or len(text) > 300:
            raise llm.LLMError(
                "Roadmap narration violates the ≤2-sentence warm-tone rule.",
                payload=text,
            )
    return s.Roadmap(
        id=roadmap_id or f"road-{uuid.uuid4().hex[:8]}",
        plan_id=plan.id,
        steps=[
            s.RoadmapStep(target=target, narration=text, camera_preset=preset)
            for (target, preset), text in zip(
                _ROADMAP_SPINE, narration.narrations, strict=True
            )
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


# ── the chat graph ────────────────────────────────────────────────────────────


class _ChatState(TypedDict):
    message: str
    session: AsyncSession
    user: m.User
    decision: RouteDecision | None
    ambiguous: bool
    response: ChatResponse | None


async def _route_node(state: _ChatState) -> dict[str, object]:
    analysis = analyze_message(state["message"])
    return {"decision": analysis.decision, "ambiguous": analysis.ambiguous}


async def _supervisor_node(state: _ChatState) -> dict[str, object]:
    decision = state["decision"]
    assert decision is not None  # route node always runs first
    return {"decision": await _supervise(state["message"], decision)}


def _needs_supervisor(state: _ChatState) -> str:
    return "supervisor" if state["ambiguous"] else "act"


async def _big_task(state: _ChatState) -> ChatResponse:
    session, user, message = state["session"], state["user"], state["message"]
    plan = await create_plan(session, user, PlanRequest(input=message))
    roadmap = await build_roadmap(plan)
    await _persist_roadmap(session, user, roadmap)
    await outbox.emit(
        session,
        user.id,
        [outbox.narrate(plan.empathy_line), outbox.tour_offer(roadmap.id)],
    )
    return ChatResponse(
        ack=plan.empathy_line, route="big_task", plan=plan, roadmap_id=roadmap.id
    )


async def _act_node(state: _ChatState) -> dict[str, object]:
    """Execute the (possibly supervisor-refined) decision. The ONLY place
    agents are invoked from chat (AGENTS.md §4.3)."""
    session, user, message = state["session"], state["user"], state["message"]
    decision = state["decision"]
    assert decision is not None

    if decision.route is Route.NARRATE:
        await outbox.emit(session, user.id, [outbox.narrate(_CHITCHAT_REPLY)])
        return {
            "response": ChatResponse(
                ack=_CHITCHAT_REPLY, route="narrate", plan=None, roadmap_id=None
            )
        }

    if decision.route is Route.BIG_TASK:
        return {"response": await _big_task(state)}

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
        return {
            "response": ChatResponse(
                ack=plan.empathy_line,
                route="direct_zone:fishboat",
                plan=plan,
                roadmap_id=None,
            )
        }
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
        return {
            "response": ChatResponse(
                ack=text, route="direct_zone:small_boat", plan=None, roadmap_id=None
            )
        }
    if zone is Zone.UNDERWATER:
        await outbox.emit(
            session, user.id,
            [
                outbox.narrate(_ZONE_NARRATION[zone]),
                outbox.camera_fly_to("underwater", "underwater"),
            ],
        )
        return {
            "response": ChatResponse(
                ack=_ZONE_NARRATION[zone],
                route="direct_zone:underwater",
                plan=None,
                roadmap_id=None,
            )
        }
    if zone is Zone.LAMP:
        await outbox.emit(
            session,
            user.id,
            [
                outbox.narrate(_ZONE_NARRATION[zone]),
                outbox.camera_fly_to("lamp", "overview"),
            ],
        )
        return {
            "response": ChatResponse(
                ack=_ZONE_NARRATION[zone],
                route="direct_zone:lamp",
                plan=None,
                roadmap_id=None,
            )
        }
    raise AssertionError(f"unhandled zone {zone}")  # unreachable — fail loudly


_ChatGraphT = CompiledStateGraph[_ChatState, None, _ChatState, _ChatState]


def _build_graph() -> _ChatGraphT:
    graph = StateGraph(_ChatState)
    graph.add_node("route", _route_node)
    graph.add_node("supervisor", _supervisor_node)
    graph.add_node("act", _act_node)
    graph.add_edge(START, "route")
    graph.add_conditional_edges("route", _needs_supervisor)
    graph.add_edge("supervisor", "act")
    graph.add_edge("act", END)
    return cast(_ChatGraphT, graph.compile())


_CHAT_GRAPH = _build_graph()


async def handle_chat(
    session: AsyncSession, user: m.User, message: str
) -> ChatResponse:
    """One chat turn: route → (supervise) → act → persist → events.
    Caller commits. LLM failures propagate as LLMError (loud, §2)."""
    result = await _CHAT_GRAPH.ainvoke(
        {
            "message": message,
            "session": session,
            "user": user,
            "decision": None,
            "ambiguous": False,
            "response": None,
        }
    )
    response = result["response"]
    assert isinstance(response, ChatResponse)  # act node always answers
    return response
