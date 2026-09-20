"""Stage 6 — orchestrator graph: LLM supervisor fallback (FR-0.3, D3/D4) +
LLM roadmap narration (FR-5.3 P1).

Only the OpenRouter HTTP boundary is mocked (§6.5). The deterministic
pre-router, ambiguity gate, graph wiring, persistence and events are real.
"""

import json
import uuid

import httpx2
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models as m
from app.agents.orchestrator.router import analyze_message
from tests.conftest import OpenRouterHttpMock, openrouter_tool_response


def _uid() -> str:
    return f"orch-{uuid.uuid4().hex[:8]}"


async def _chat(client: AsyncClient, user: str, message: str) -> httpx2.Response:
    return await client.post(
        "/api/chat", headers={"X-Harbour-User-Id": user}, json={"message": message}
    )


# ── ambiguity gate (deterministic evidence) ──────────────────────────────────


def test_ambiguity_gate() -> None:
    # C03: bare zone request — clear, supervisor NOT consulted.
    assert not analyze_message("Show me my flashcard decks").ambiguous
    # C06: chitchat — clear.
    assert not analyze_message("hello").ambiguous
    # ≥2 zones — the deterministic big-task rule stands, no supervisor.
    assert not analyze_message("fishboat and lamp").ambiguous
    # C09 (D4): one zone + residual learning content — ambiguous.
    assert analyze_message(
        "Help me understand photosynthesis and drill my flashcards"
    ).ambiguous
    # C01 (D1): 0 zones, emotional learning message — ambiguous.
    assert analyze_message("I'm overwhelmed — calculus exam in 5 days").ambiguous
    # C08 (D3): zone + residual ("schedule my revision week") — ambiguous.
    assert analyze_message("fishboat, schedule my revision week").ambiguous


async def test_clear_zone_request_makes_no_llm_call(
    client: AsyncClient, openrouter_http: OpenRouterHttpMock
) -> None:
    """FR-0.1: a clear direct-zone message never touches the LLM. The
    unconfigured mock raises if any call is attempted — proof by execution."""
    resp = await _chat(client, _uid(), "underwater")
    assert resp.status_code == 200
    assert resp.json()["route"] == "direct_zone:underwater"
    assert openrouter_http.requests == []


# ── supervisor node ───────────────────────────────────────────────────────────


async def test_supervisor_confirms_big_task(
    client: AsyncClient, openrouter_stub: OpenRouterHttpMock
) -> None:
    user = _uid()
    resp = await _chat(client, user, "I'm overwhelmed — calculus exam in 5 days")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["route"] == "big_task"
    assert body["plan"] is not None
    # The supervisor WAS consulted (first LLM call), then the planner's two.
    assert openrouter_stub.tool_name(0) == "SupervisorDecision"


async def test_supervisor_rescues_the_dropped_topic(
    client: AsyncClient, db_session: AsyncSession, openrouter_http: OpenRouterHttpMock
) -> None:
    """D4/F3: "understand photosynthesis AND drill my flashcards" — the
    supervisor routes to big_task and the plan keeps the topic."""

    def handler(req: httpx2.Request) -> httpx2.Response:
        body = json.loads(req.content)
        tool = body["tools"][0]["function"]["name"]
        if tool == "SupervisorDecision":
            return openrouter_tool_response(
                tool, {"route": "big_task", "zone": None,
                       "reason": "learning goal plus zone mention"}
            )
        if tool == "GoalExtraction":
            return openrouter_tool_response(
                tool, {"goal": "learn photosynthesis and drill flashcards",
                       "empathyLine": "We'll take it one small step at a time."}
            )
        if tool == "TaskBreakdown":
            return openrouter_tool_response(tool, {"tasks": [
                {"title": f"Step {i} on photosynthesis",
                 "description": "One small step.", "estimateMinutes": 20,
                 "difficulty": 2}
                for i in range(1, 7)
            ]})
        if tool == "RoadmapNarration":
            return openrouter_tool_response(tool, {"narrations": [
                "Your fishboat holds the plan.",
                "The fleet carries your decks.",
                "The atlas glows below.",
                "The lamp keeps your victories.",
            ]})
        raise AssertionError(f"unexpected tool {tool}")

    openrouter_http.handler = handler
    resp = await _chat(
        client, _uid(), "Help me understand photosynthesis and drill my flashcards"
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["route"] == "big_task"  # topic NOT dropped
    assert "photosynthesis" in body["plan"]["goal"]


async def test_supervisor_can_settle_on_direct_zone(
    client: AsyncClient, openrouter_http: OpenRouterHttpMock
) -> None:
    """C08-shaped message: supervisor confirms the zone; NO tour offered."""

    def handler(req: httpx2.Request) -> httpx2.Response:
        body = json.loads(req.content)
        tool = body["tools"][0]["function"]["name"]
        if tool == "SupervisorDecision":
            return openrouter_tool_response(
                tool, {"route": "direct_zone", "zone": "small_boat",
                       "reason": "the student just wants their decks"}
            )
        raise AssertionError(f"unexpected tool {tool}")

    openrouter_http.handler = handler
    resp = await _chat(client, _uid(), "small boats, show me my chemistry decks")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["route"] == "direct_zone:small_boat"
    assert body["roadmapId"] is None  # FR-0.1: never a tour


async def test_supervisor_invalid_combo_is_a_loud_error(
    client: AsyncClient, db_session: AsyncSession, openrouter_http: OpenRouterHttpMock
) -> None:
    """§2.4: supervisor returns direct_zone without a zone → hard error
    envelope + SSE error event, never a guessed route."""
    user = _uid()
    openrouter_http.handler = lambda req: openrouter_tool_response(
        "SupervisorDecision", {"route": "direct_zone", "zone": None,
                               "reason": "broken"}
    )
    resp = await _chat(client, user, "I'm overwhelmed — calculus exam in 5 days")
    assert resp.status_code == 502
    assert resp.json()["code"] == "LLM_UNAVAILABLE"
    events = (
        (await db_session.execute(
            select(m.EventOutbox.type).where(m.EventOutbox.user_id == user)
        ))
        .scalars()
        .all()
    )
    assert events == ["error"]


async def test_llm_down_during_big_task_is_envelope_plus_sse_error(
    client: AsyncClient, db_session: AsyncSession, openrouter_http: OpenRouterHttpMock
) -> None:
    user = _uid()
    openrouter_http.handler = lambda req: openrouter_tool_response(
        "SupervisorDecision", {}, status=503
    )
    resp = await _chat(client, user, "I'm overwhelmed — calculus exam in 5 days")
    assert resp.status_code == 502
    assert resp.json()["code"] == "LLM_UNAVAILABLE"
    events = (
        (await db_session.execute(
            select(m.EventOutbox.type).where(m.EventOutbox.user_id == user)
        ))
        .scalars()
        .all()
    )
    assert events == ["error"]
    # No fake plan persisted (§3.4 — no canned content).
    plans = (
        await db_session.execute(
            select(m.StudyPlan).where(m.StudyPlan.user_id == user)
        )
    ).scalars().all()
    assert plans == []


# ── roadmap narration (FR-5.3 P1) ─────────────────────────────────────────────


async def test_plan_endpoint_llm_failure_is_a_loud_envelope(
    client: AsyncClient, openrouter_http: OpenRouterHttpMock
) -> None:
    """POST /agents/scheduler/plan with OpenRouter down → §5.2 envelope,
    never a canned plan (§3.4)."""
    openrouter_http.handler = lambda req: openrouter_tool_response(
        "GoalExtraction", {}, status=500
    )
    resp = await client.post(
        "/agents/scheduler/plan",
        headers={"X-Harbour-User-Id": _uid()},
        json={"input": "revise organic chemistry"},
    )
    assert resp.status_code == 502
    assert resp.json()["code"] == "LLM_UNAVAILABLE"


async def test_roadmap_narration_is_llm_generated(
    client: AsyncClient, openrouter_stub: OpenRouterHttpMock
) -> None:
    """F5: narration comes from the RoadmapNarration tool call and lands on
    the persisted roadmap (4 fixed steps, ≤2 warm sentences each)."""
    user = _uid()
    resp = await _chat(client, user, "I need to revise linear algebra")
    assert resp.status_code == 200, resp.text
    roadmap_id = resp.json()["roadmapId"]
    assert openrouter_stub.tool_name(-1) == "RoadmapNarration"

    tour = await client.post(
        f"/api/tours/{roadmap_id}/start", headers={"X-Harbour-User-Id": user}
    )
    steps = tour.json()["steps"]
    assert [s["target"] for s in steps] == ["fishboat", "fleet", "underwater", "lamp"]
    assert all(s["narration"].strip() for s in steps)
    assert all(len(s["narration"]) <= 300 for s in steps)


async def test_roadmap_narration_over_two_sentences_is_rejected(
    client: AsyncClient, openrouter_http: OpenRouterHttpMock
) -> None:
    """F5 guardrail: a 3-sentence narration violates FR-5.5 → loud error,
    NOT silently accepted or replaced with canned text."""
    from tests.conftest import _stub_arguments

    def handler(req: httpx2.Request) -> httpx2.Response:
        body = json.loads(req.content)
        tool = body["tools"][0]["function"]["name"]
        if tool == "RoadmapNarration":
            return openrouter_tool_response(tool, {"narrations": [
                "One. Two. Three.", "Fine.", "Fine.", "Fine.",
            ]})
        user_msg = next(
            (m["content"] for m in reversed(body["messages"]) if m["role"] == "user"),
            "",
        )
        return openrouter_tool_response(tool, _stub_arguments(tool, user_msg))

    openrouter_http.handler = handler
    resp = await _chat(client, _uid(), "I need to revise linear algebra")
    assert resp.status_code == 502
    assert resp.json()["code"] == "LLM_UNAVAILABLE"
