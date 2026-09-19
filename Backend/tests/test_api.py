"""DB-backed API + seed tests — against REAL Postgres (AGENTS.md §6.3).

Harness (Agent S, tests/conftest.py): a fresh `harbour_test` database per
session, migrated with `alembic upgrade head`; `client` = HTTP through the
real ASGI app; `live_client` = HTTP against a REAL in-test uvicorn server
(required for SSE — ASGITransport cannot drive infinite streams,
docs/sessions/015); `db_session` = direct async session; `seeded_user_id` =
runs the seed loader (Agent S's canonical fixture) once per test session.
"""

import json
import uuid

from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models as m
from app.schemas import WorldState
from scripts import seed as seed_module

# ── seed loader idempotency (exit test: runs twice without error) ────────────


async def test_seed_loader_is_idempotent(
    seeded_user_id: str, db_session: AsyncSession
) -> None:
    fixture = seed_module.load_fixture()
    first = await seed_module.seed(fixture)
    second = await seed_module.seed(fixture)  # wipe + re-seed: no dup errors
    assert first == second
    outbox_rows = (
        await db_session.execute(
            select(func.count())
            .select_from(m.EventOutbox)
            .where(m.EventOutbox.user_id == seeded_user_id)
        )
    ).scalar_one()
    assert outbox_rows == 1  # exactly the seeded narrate (seq=1), not duplicated


# ── world-state assembly vs the frozen contract ──────────────────────────────


async def test_world_state_matches_contract(
    client: AsyncClient, seeded_user_id: str
) -> None:
    resp = await client.get(
        "/api/world-state",
        headers={
            "X-Harbour-User-Id": seeded_user_id,
            "X-Harbour-Timezone": "Asia/Shanghai",
        },
    )
    assert resp.status_code == 200
    state = WorldState.model_validate(resp.json())  # hard check vs contract
    assert state.reviewing is None
    assert state.pending_tour is None
    assert state.last_event_seq == 1  # seeded narrate
    assert state.active_plan is not None and state.active_plan.id == "plan-seed-01"
    assert 0.0 < state.lamp_glow_level <= 1.0
    assert 40 <= state.graph_summary.node_count <= 80  # §4.6 atlas size
    # camelCase keys exactly per §5.2
    assert "lastEventSeq" in resp.json() and "lampGlowLevel" in resp.json()


# ── today-decks logic (due vs not-due — drives the circle, FR-2.4) ───────────


async def test_today_decks_due_vs_not_due(
    client: AsyncClient, seeded_user_id: str
) -> None:
    resp = await client.get(
        "/agents/flashcards/today", headers={"X-Harbour-User-Id": seeded_user_id}
    )
    assert resp.status_code == 200
    decks = resp.json()
    by_id = {d["id"]: d for d in decks}
    assert "deck-thermo-1" in by_id  # 3-card due deck
    assert by_id["deck-thermo-1"]["dueToday"] == 3
    assert "deck-thermo-basics" not in by_id  # completed, docked — not due
    assert all(d["dueToday"] > 0 for d in decks)


async def test_world_state_decks_have_boat_state_and_counts(
    client: AsyncClient, seeded_user_id: str
) -> None:
    resp = await client.get(
        "/api/world-state", headers={"X-Harbour-User-Id": seeded_user_id}
    )
    decks = {d["id"]: d for d in resp.json()["decks"]}
    assert decks["deck-thermo-1"]["boatState"] == "circle"
    assert decks["deck-thermo-1"]["cardCount"] == 3
    assert decks["deck-thermo-basics"]["boatState"] == "docked"


# ── outbox seq ordering over SSE (§5.3) ──────────────────────────────────────


async def test_sse_replays_outbox_in_seq_order(
    live_client: AsyncClient, seeded_user_id: str
) -> None:
    # live_client (real in-test uvicorn): ASGITransport cannot drive infinite
    # SSE streams — it awaits the ASGI app to completion (docs/sessions/015).
    frames: list[str] = []
    async with live_client.stream(
        "GET", "/api/events", headers={"X-Harbour-User-Id": seeded_user_id}
    ) as resp:
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")
        async for line in resp.aiter_lines():
            frames.append(line)
            if line.startswith("data:"):  # first event frame complete
                break
    assert "id: 1" in frames  # SSE frame id = seq
    payload = json.loads(
        next(line[5:].strip() for line in frames if line.startswith("data:"))
    )
    assert payload["seq"] == 1
    assert payload["type"] == "narrate"
    assert payload["id"] == seed_module.SEED_EVENT_ID


# ── failure paths (AGENTS.md §6.4 — mandatory) ───────────────────────────────


async def test_missing_user_header_returns_4xx_envelope(client: AsyncClient) -> None:
    resp = await client.get("/api/world-state")
    assert resp.status_code == 400
    body = resp.json()
    assert body["code"] == "MISSING_USER_ID"
    assert set(body) == {"code", "message", "detail", "recoverable"}


async def test_invalid_timezone_returns_4xx_envelope(client: AsyncClient) -> None:
    resp = await client.get(
        "/api/world-state",
        headers={
            "X-Harbour-User-Id": str(uuid.uuid4()),
            "X-Harbour-Timezone": "Mars/Olympus",
        },
    )
    assert resp.status_code == 400
    assert resp.json()["code"] == "INVALID_TIMEZONE"


async def test_first_seen_user_is_upserted(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    user_id = f"test-{uuid.uuid4()}"
    resp = await client.get(
        "/api/world-state",
        headers={"X-Harbour-User-Id": user_id, "X-Harbour-Timezone": "Europe/London"},
    )
    assert resp.status_code == 200
    assert resp.json()["user"]["timezone"] == "Europe/London"
    row = (
        await db_session.execute(select(m.User).where(m.User.id == user_id))
    ).scalar_one()
    assert row.timezone == "Europe/London"
