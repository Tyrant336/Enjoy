"""Integration tests — chat (FR-0/FR-5), planner endpoints (FR-1), tours.

Each test uses its OWN fresh user so chat-created plans/roadmaps never leak
between tests (the seeded fixture user keeps its §4.6 state for review tests).

P1: chat big-task/direct-fishboat paths call the LLM (planner, supervisor,
roadmap narration). Only the OpenRouter HTTP boundary is mocked (§6.5) via
the `openrouter_stub` fixture — every chat/plan test declares it.
"""

import json
import uuid
from typing import Any, cast

import pytest
from httpx import AsyncClient

from tests.conftest import OpenRouterHttpMock


def uid() -> str:
    return f"chat-{uuid.uuid4().hex[:8]}"


async def _chat(client: AsyncClient, user: str, message: str) -> dict[str, Any]:
    resp = await client.post(
        "/api/chat", headers={"X-Harbour-User-Id": user}, json={"message": message}
    )
    assert resp.status_code == 200, resp.text
    return cast(dict[str, Any], resp.json())


# ── big task → plan + roadmap + tour OFFER (never forced) ────────────────────


@pytest.mark.asyncio
async def test_big_task_offers_tour_and_persists_plan(
    client: AsyncClient, live_client: AsyncClient, openrouter_stub: OpenRouterHttpMock
) -> None:
    user = uid()
    r = await _chat(client, user, "I'm afraid of revising thermodynamics")
    assert r["route"] == "big_task"
    assert r["plan"] is not None and r["roadmapId"] is not None
    assert len(r["plan"]["tasks"]) == 6  # default granularity 3
    assert r["plan"]["empathyLine"] == r["ack"]

    # world-state: the offer is pending, the plan is active
    ws = (
        await client.get("/api/world-state", headers={"X-Harbour-User-Id": user})
    ).json()
    assert ws["pendingTour"]["roadmapId"] == r["roadmapId"]
    assert len(ws["pendingTour"]["roadmap"]["steps"]) == 4
    assert ws["activePlan"]["id"] == r["plan"]["id"]
    seq_after_chat = ws["lastEventSeq"]

    # events so far: narrate then tour_offer (ascending, after the seed seq)
    events = []
    async with live_client.stream(
        "GET", "/api/events", headers={"X-Harbour-User-Id": user}
    ) as resp:
        async for line in resp.aiter_lines():
            if line.startswith("data:"):
                events.append(json.loads(line[5:].strip()))
            if len(events) >= 2:
                break
    assert [e["type"] for e in events] == ["narrate", "tour_offer"]
    assert events[1]["roadmapId"] == r["roadmapId"]

    # ── accept the offer → tour_start; offer no longer pending ──
    resp = await client.post(
        f"/api/tours/{r['roadmapId']}/start", headers={"X-Harbour-User-Id": user}
    )
    assert resp.status_code == 200
    roadmap = resp.json()
    assert roadmap["id"] == r["roadmapId"]
    assert [s["target"] for s in roadmap["steps"]] == [
        "fishboat", "fleet", "underwater", "lamp",
    ]
    ws = (
        await client.get("/api/world-state", headers={"X-Harbour-User-Id": user})
    ).json()
    assert ws["pendingTour"] is None
    assert ws["lastEventSeq"] > seq_after_chat


@pytest.mark.asyncio
async def test_dismiss_clears_pending_offer_and_replay_restarts(
    client: AsyncClient, openrouter_stub: OpenRouterHttpMock
) -> None:
    user = uid()
    r = await _chat(client, user, "help me plan my physics revision")

    resp = await client.post(
        f"/api/tours/{r['roadmapId']}/dismiss", headers={"X-Harbour-User-Id": user}
    )
    assert resp.status_code == 200
    ws = (
        await client.get("/api/world-state", headers={"X-Harbour-User-Id": user})
    ).json()
    assert ws["pendingTour"] is None

    # "?" replay works even after dismissing — the tour is always replayable
    resp = await client.post(
        f"/api/tours/{r['roadmapId']}/replay", headers={"X-Harbour-User-Id": user}
    )
    assert resp.status_code == 200
    assert resp.json()["id"] == r["roadmapId"]


@pytest.mark.asyncio
async def test_tour_endpoints_404_for_unknown_or_foreign_roadmaps(
    client: AsyncClient, openrouter_stub: OpenRouterHttpMock
) -> None:
    user = uid()
    r = await _chat(client, user, "thermodynamics")
    stranger = uid()
    for verb in ("start", "dismiss", "replay"):
        resp = await client.post(
            f"/api/tours/{r['roadmapId']}/{verb}",
            headers={"X-Harbour-User-Id": stranger},
        )
        assert resp.status_code == 404
        assert resp.json()["code"] == "ROADMAP_NOT_FOUND"
    resp = await client.post(
        "/api/tours/road-nope/start", headers={"X-Harbour-User-Id": user}
    )
    assert resp.status_code == 404


# ── direct zones: one agent, NEVER a tour (FR-0.1 / §8.6) ────────────────────


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("message", "route", "plan_expected"),
    [
        ("fishboat", "direct_zone:fishboat", True),
        ("small boat", "direct_zone:small_boat", False),
        ("underwater", "direct_zone:underwater", False),
        ("journal", "direct_zone:lamp", False),
    ],
)
async def test_direct_zones_never_offer_tours(
    client: AsyncClient,
    openrouter_stub: OpenRouterHttpMock,
    message: str,
    route: str,
    plan_expected: bool,
) -> None:
    user = uid()
    r = await _chat(client, user, message)
    assert r["route"] == route
    assert r["roadmapId"] is None
    assert (r["plan"] is not None) is plan_expected
    ws = (
        await client.get("/api/world-state", headers={"X-Harbour-User-Id": user})
    ).json()
    assert ws["pendingTour"] is None


@pytest.mark.asyncio
async def test_chitchat_gets_a_warm_line_and_nothing_else(
    client: AsyncClient,
) -> None:
    user = uid()
    r = await _chat(client, user, "hi")
    assert r["route"] == "narrate"
    assert r["plan"] is None and r["roadmapId"] is None
    ws = (
        await client.get("/api/world-state", headers={"X-Harbour-User-Id": user})
    ).json()
    assert ws["activePlan"] is None and ws["pendingTour"] is None


# ── planner + task-complete endpoints (FR-1) ─────────────────────────────────


@pytest.mark.asyncio
async def test_post_plan_endpoint_persists_and_validates(
    client: AsyncClient, openrouter_stub: OpenRouterHttpMock
) -> None:
    user = uid()
    resp = await client.post(
        "/agents/scheduler/plan",
        headers={"X-Harbour-User-Id": user},
        json={"input": "revise organic chemistry", "granularity": 2},
    )
    assert resp.status_code == 200
    plan = resp.json()
    assert len(plan["tasks"]) == 4
    ws = (
        await client.get("/api/world-state", headers={"X-Harbour-User-Id": user})
    ).json()
    assert ws["activePlan"]["id"] == plan["id"]

    # garbage request → 422 envelope
    resp = await client.post(
        "/agents/scheduler/plan",
        headers={"X-Harbour-User-Id": user},
        json={"input": "", "granularity": 3},
    )
    assert resp.status_code == 422
    assert resp.json()["code"] == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_complete_task_writes_record_once_and_glows(
    client: AsyncClient, live_client: AsyncClient, openrouter_stub: OpenRouterHttpMock
) -> None:
    user = uid()
    plan = (
        await client.post(
            "/agents/scheduler/plan",
            headers={"X-Harbour-User-Id": user},
            json={"input": "revise organic chemistry"},
        )
    ).json()
    task_id = plan["tasks"][0]["id"]

    r1 = (
        await client.post(
            f"/agents/scheduler/tasks/{task_id}/complete",
            headers={"X-Harbour-User-Id": user},
        )
    ).json()
    assert r1["task"]["status"] == "done"
    assert r1["record"]["kind"] == "task_done" and r1["record"]["refId"] == task_id

    # idempotent: completing again returns the same record, no duplicate
    r2 = (
        await client.post(
            f"/agents/scheduler/tasks/{task_id}/complete",
            headers={"X-Harbour-User-Id": user},
        )
    ).json()
    assert r2["record"]["id"] == r1["record"]["id"]

    ws = (
        await client.get("/api/world-state", headers={"X-Harbour-User-Id": user})
    ).json()
    task_records = [r for r in ws["records"] if r["refId"] == task_id]
    assert len(task_records) == 1
    assert ws["lampGlowLevel"] > 0.0

    # unknown task → 404 envelope
    resp = await client.post(
        "/agents/scheduler/tasks/task-nope/complete",
        headers={"X-Harbour-User-Id": user},
    )
    assert resp.status_code == 404
    assert resp.json()["code"] == "TASK_NOT_FOUND"

    # a lamp_glow event was emitted for the completion
    events = []
    async with live_client.stream(
        "GET", "/api/events", headers={"X-Harbour-User-Id": user}
    ) as resp:
        async for line in resp.aiter_lines():
            if line.startswith("data:"):
                events.append(json.loads(line[5:].strip()))
            if events and events[-1]["type"] == "lamp_glow":
                break
    assert events[-1]["type"] == "lamp_glow"
