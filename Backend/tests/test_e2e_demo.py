"""E2E — REQUIREMENTS §8 demo script, expressed as tests (AGENTS.md §6.3).

STATUS (session 018): gates flip live as endpoints land. Session 018 activated
§8.2/8.3/8.4/8.6 (chat, tours, review loop — all verified against the real API).
- Seeded steps use `seeded_user_id` (the pristine §4.6 world).
- MUTATING steps (chat/tours/review) use FRESH per-test users with their own
  decks, so the seeded world is never poisoned and tests stay independent.
- Remaining skips are phase gates (browser halves) naming their activation.

Inherently visual/FE steps (palette §2.4, dive animation, keyboard-only
review, reduced-motion) are asserted by Agent T's exit tests + the monitor's
Phase 3 visual pass, not from pytest — noted per step below.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models as m
from app.schemas import KnowledgeGraph, Roadmap, WorldState

# ── §8.1 — services start; seeded world state is complete and consistent ────
# (Visual half — fishboat/lamp/fleet render, palette §2.4 — is Agent T's.)


async def test_step1_seeded_harbour_state(
    client: AsyncClient, seeded_user_id: str
) -> None:
    resp = await client.get(
        "/api/world-state", headers={"X-Harbour-User-Id": seeded_user_id}
    )
    assert resp.status_code == 200
    state = WorldState.model_validate(resp.json())

    # §8.1: "Harbour overview renders fishboat, lamp, ≥1 circling due deck,
    # 1 docked deck" — the backend half of that sentence.
    assert state.active_plan is not None and state.active_plan.id == "plan-seed-01"
    circling = [d for d in state.decks if d.boat_state == "circle"]
    docked = [d for d in state.decks if d.boat_state == "docked"]
    assert len(circling) >= 1, "≥1 circling due deck (the review queue)"
    assert len(docked) >= 1, "1 docked completed deck at the lamp"
    assert all(d.due_today > 0 for d in circling)
    assert 0.0 < state.lamp_glow_level <= 1.0, "lamp has its base glow (FR-4.4)"
    assert 40 <= state.graph_summary.node_count <= 80  # §4.6 atlas size


# ── §8.2 — big task → warm ack + tour OFFER (never forced) ──────────────────


async def _outbox_types(db_session: AsyncSession, user_id: str) -> list[str]:
    """The user's WorldEvent types in per-user seq order (§5.3 — real DB read)."""
    rows = (
        (
            await db_session.execute(
                select(m.EventOutbox)
                .where(m.EventOutbox.user_id == user_id)
                .order_by(m.EventOutbox.seq)
            )
        )
        .scalars()
        .all()
    )
    return [row.type for row in rows]


async def test_step2_big_task_offers_tour_never_forced(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    uid = f"e2e-chat-{uuid.uuid4().hex[:8]}"
    headers = {"X-Harbour-User-Id": uid}

    resp = await client.post(
        "/api/chat",
        json={"message": "I'm afraid of revising thermodynamics"},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["route"] == "big_task"
    assert "one small step" in body["ack"], "warm empathy ack (FR-1.1)"
    assert body["plan"] is not None and len(body["plan"]["tasks"]) == 6
    roadmap_id = body["roadmapId"]
    assert roadmap_id is not None

    # OFFERED, never forced (§1): narrate + tour_offer enqueued, NO tour_start.
    assert await _outbox_types(db_session, uid) == ["narrate", "tour_offer"]

    # Accept → tour_start; the roadmap comes back canonical (§5.1).
    start = await client.post(f"/api/tours/{roadmap_id}/start", headers=headers)
    assert start.status_code == 200
    roadmap = Roadmap.model_validate(start.json())
    assert roadmap.id == roadmap_id and len(roadmap.steps) == 4
    assert (await _outbox_types(db_session, uid))[-1] == "tour_start"

    # "Not now" → tour_end; unknown roadmap → §5.2 error envelope.
    dismiss = await client.post(f"/api/tours/{roadmap_id}/dismiss", headers=headers)
    assert dismiss.status_code == 200
    assert (await _outbox_types(db_session, uid))[-1] == "tour_end"
    missing = await client.post("/api/tours/road-nope/start", headers=headers)
    assert missing.status_code == 404
    assert missing.json()["code"] == "ROADMAP_NOT_FOUND"


# ── §8.3 — review loop: start → reveal → grade → exit → resume ──────────────


async def _seed_review_deck(
    client: AsyncClient, db_session: AsyncSession, user_id: str, deck_id: str
) -> list[str]:
    """A real 3-card due deck for a FRESH user (mirror of the §4.6 review deck)."""
    resp = await client.get("/api/world-state", headers={"X-Harbour-User-Id": user_id})
    assert resp.status_code == 200  # first-seen user upserted (§4.4)
    db_session.add(
        m.Deck(
            id=deck_id, user_id=user_id, name="E2E Review Deck",
            boat_state="circle", apkg_url=None,
        )
    )
    card_ids = [f"{deck_id}-c{i}" for i in range(1, 4)]
    for i, card_id in enumerate(card_ids):
        db_session.add(
            m.Flashcard(
                id=card_id, deck_id=deck_id, user_id=user_id,
                question=f"E2E question {i + 1}?", answer=f"E2E answer {i + 1}.",
                due=datetime.now(UTC) - timedelta(minutes=5),
                fsrs={"state": "new", "stability": None, "difficulty": None,
                      "intervalDays": None, "reps": 0},
                source_snippet=None,
            )
        )
    await db_session.commit()
    return card_ids


async def test_step3_review_loop_persists_grades(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    uid = f"e2e-review-{uuid.uuid4().hex[:8]}"
    deck_id = f"e2e-deck-{uuid.uuid4().hex[:8]}"
    c1, c2, c3 = await _seed_review_deck(client, db_session, uid, deck_id)
    headers = {"X-Harbour-User-Id": uid}

    start = await client.post(
        "/agents/flashcards/review/start", json={"deckId": deck_id}, headers=headers
    )
    assert start.status_code == 200
    body = start.json()
    assert body["card"]["id"] == c1, "session opens on the first due card"
    progress = body["progress"]
    assert (progress["total"], progress["graded"], progress["remaining"]) == (3, 0, 3)
    assert progress["completed"] is False

    # Question first; the answer comes only via REST reveal (§5.2).
    reveal = await client.post(
        "/agents/flashcards/review/reveal", json={"cardId": c1}, headers=headers
    )
    assert reveal.status_code == 200
    assert reveal.json()["answer"] == "E2E answer 1."

    grade1 = await client.post(
        "/agents/flashcards/review/grade",
        json={"cardId": c1, "rating": "good"}, headers=headers,
    )
    assert grade1.status_code == 200
    p1 = grade1.json()["deckProgress"]
    assert (p1["graded"], p1["remaining"]) == (1, 2)
    assert p1["nextCard"]["id"] == c2

    # Grade persisted immediately (FR-2.5.5): due moved +3 days (FR-2.8 P0).
    card_row = (
        await db_session.execute(select(m.Flashcard).where(m.Flashcard.id == c1))
    ).scalar_one()
    await db_session.refresh(card_row)  # bypass this session's identity map
    assert card_row.due > datetime.now(UTC) + timedelta(days=2)
    assert card_row.fsrs["reps"] == 1

    # FR-2.9: "Again" schedules sooner but does NOT re-show the card in-session.
    grade2 = await client.post(
        "/agents/flashcards/review/grade",
        json={"cardId": c2, "rating": "again"}, headers=headers,
    )
    p2 = grade2.json()["deckProgress"]
    assert (p2["graded"], p2["remaining"]) == (2, 1)
    assert p2["nextCard"]["id"] == c3, "the Again-graded card never comes back"

    # "Return to harbour" mid-deck keeps progress (FR-2.5.6) and resumes.
    exit_resp = await client.post(
        "/agents/flashcards/review/exit", json={"deckId": deck_id}, headers=headers
    )
    assert exit_resp.status_code == 200
    resumed = await client.post(
        "/agents/flashcards/review/start", json={"deckId": deck_id}, headers=headers
    )
    p3 = resumed.json()["progress"]
    assert (p3["graded"], p3["remaining"]) == (2, 1)
    assert resumed.json()["card"]["id"] == c3

    # The whole visual run landed in the outbox, in seq order (§5.3).
    assert await _outbox_types(db_session, uid) == [
        "enter_review_pov", "show_card",
        "sink_boat", "rise_boat",
        "sink_boat", "rise_boat",
        "exit_review_pov",
        "enter_review_pov", "show_card",
    ]


# ── §8.4 — deck completion docks at lamp + journal record (one transaction) ──


async def test_step4_deck_completion_docks_records_glows(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    uid = f"e2e-finish-{uuid.uuid4().hex[:8]}"
    deck_id = f"e2e-deck-{uuid.uuid4().hex[:8]}"
    c1, c2, c3 = await _seed_review_deck(client, db_session, uid, deck_id)
    headers = {"X-Harbour-User-Id": uid}

    await client.post(
        "/agents/flashcards/review/start", json={"deckId": deck_id}, headers=headers
    )
    for card_id, rating in [(c1, "good"), (c2, "hard"), (c3, "easy")]:
        resp = await client.post(
            "/agents/flashcards/review/grade",
            json={"cardId": card_id, "rating": rating}, headers=headers,
        )
        assert resp.status_code == 200
    final = resp.json()
    assert final["deckProgress"]["completed"] is True
    assert final["deckProgress"]["nextCard"] is None

    # Dock + journal + glow (FR-2.6/FR-4) — committed in ONE transaction (§5.3).
    state = await client.get("/api/world-state", headers=headers)
    decks = {d["id"]: d for d in state.json()["decks"]}
    assert decks[deck_id]["boatState"] == "docked"
    assert state.json()["lampGlowLevel"] > 0, "lamp glows up (FR-4.4)"
    records = await client.get("/api/records", headers=headers)
    matches = [
        r for r in records.json()
        if r["refId"] == deck_id and r["kind"] == "deck_completed"
    ]
    assert len(matches) == 1

    # Visual order per §5.3: … sink_boat → dock_at_lamp → lamp_glow.
    assert (await _outbox_types(db_session, uid))[-3:] == [
        "sink_boat", "dock_at_lamp", "lamp_glow",
    ]


# ── Phase 3 gate — refresh DURING review: world-state alone rebuilds the ────
# session (backend half; the browser half lives in docs/PHASE3-E2E-CHECKLIST.md).
# This is exactly the payload worldApi.syncFromWorldState consumes (session 020).


async def test_refresh_mid_review_world_state_rebuilds_session(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    uid = f"e2e-refresh-{uuid.uuid4().hex[:8]}"
    deck_id = f"e2e-deck-{uuid.uuid4().hex[:8]}"
    c1, c2, _c3 = await _seed_review_deck(client, db_session, uid, deck_id)
    headers = {"X-Harbour-User-Id": uid}

    start = await client.post(
        "/agents/flashcards/review/start", json={"deckId": deck_id}, headers=headers
    )
    assert start.status_code == 200
    grade = await client.post(
        "/agents/flashcards/review/grade",
        json={"cardId": c1, "rating": "good"}, headers=headers,
    )
    assert grade.status_code == 200  # mid-review: 1 graded, 2 remaining

    # A FRESH client (browser refresh = no SSE history) re-fetches world-state.
    resp = await client.get("/api/world-state", headers=headers)
    assert resp.status_code == 200
    # Strict contract parse — the exact object syncFromWorldState validates (§2.4).
    state = WorldState.model_validate(resp.json())

    # reviewing carries deck + card position: the graded card is NOT reshown
    # (FR-2.9); the session resumes on the next ungraded card.
    assert state.reviewing is not None, "refresh mid-review must keep the POV"
    assert state.reviewing.deck_id == deck_id
    assert state.reviewing.current_card is not None
    assert state.reviewing.current_card.id == c2, "resume position = next ungraded"
    assert state.reviewing.answer_revealed is False

    # The deck row agrees the boat is in review POV (world projection anchor).
    decks = {d.id: d for d in state.decks}
    assert decks[deck_id].boat_state == "reviewing"

    # lastEventSeq is the SSE gap anchor: it must equal the outbox high-water
    # mark so a reconnected bus can prove it missed nothing (§5.2).
    max_seq = (
        await db_session.execute(
            select(func.coalesce(func.max(m.EventOutbox.seq), 0)).where(
                m.EventOutbox.user_id == uid
            )
        )
    ).scalar_one()
    assert state.last_event_seq == max_seq
    assert state.last_event_seq > 0, "review events were emitted before refresh"

    # Sufficiency, proven: the rebuilt position drives a real resume — a fresh
    # review/start returns exactly the card world-state said was current.
    resumed = await client.post(
        "/agents/flashcards/review/start", json={"deckId": deck_id}, headers=headers
    )
    assert resumed.status_code == 200
    assert resumed.json()["card"]["id"] == state.reviewing.current_card.id
    progress = resumed.json()["progress"]
    assert (progress["graded"], progress["remaining"]) == (1, 2)


# ── §8.5 — atlas serves the seeded graph (rendering is Agent T's half) ──────


async def test_step5_atlas_serves_seeded_graph(
    client: AsyncClient, seeded_user_id: str
) -> None:
    resp = await client.get(
        "/agents/kg/graph", headers={"X-Harbour-User-Id": seeded_user_id}
    )
    assert resp.status_code == 200
    graph = KnowledgeGraph.model_validate(resp.json())
    assert 40 <= len(graph.nodes) <= 80
    assert {n.cluster_id for n in graph.nodes} == {
        "deck-thermo-1",
        "deck-thermo-basics",
    }
    assert all(n.gloss.strip() for n in graph.nodes), "FR-3.5 detail-drawer gloss"
    # §2.4/NFR-2 color compliance is checked on the rendered side (Agent T).


# ── §8.6 — direct-zone requests route to one zone, never offer a tour ───────


async def test_step6_direct_zone_requests_never_offer_tour(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    uid = f"e2e-zones-{uuid.uuid4().hex[:8]}"
    headers = {"X-Harbour-User-Id": uid}
    for message, expected_route in [
        ("fishboat", "direct_zone:fishboat"),
        ("small boat", "direct_zone:small_boat"),
        ("atlas", "direct_zone:underwater"),
        ("journal", "direct_zone:lamp"),
    ]:
        resp = await client.post(
            "/api/chat", json={"message": message}, headers=headers
        )
        assert resp.status_code == 200, message
        body = resp.json()
        assert body["route"] == expected_route, message
        assert body["roadmapId"] is None, "direct zones NEVER offer a tour (FR-0.1)"
    assert "tour_offer" not in await _outbox_types(db_session, uid)


# ── §8.7 — keyboard-only review + reduced-motion (browser-level halves) ─────


@pytest.mark.skip(
    reason="browser-level keyboard path — activates in Phase 3 via "
    "docs/PHASE3-E2E-CHECKLIST.md (T's review POV); backend half = test_step3"
)
async def test_step7_keyboard_only_three_card_review() -> None:
    raise AssertionError("unreachable while skipped")


@pytest.mark.skip(
    reason="browser-level reduced-motion variants — Phase 3 run of "
    "docs/PHASE3-E2E-CHECKLIST.md (§7.4)"
)
async def test_step7_reduced_motion_variants() -> None:
    raise AssertionError("unreachable while skipped")


# ── §8.8 — missing OpenRouter key = loud startup crash, never a fake world ──


def test_step8_missing_openrouter_key_crashes_startup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.core.config import Settings

    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    with pytest.raises(ValidationError, match="openrouter_api_key"):
        # _env_file=None: prove the crash even without the repo-root .env.
        Settings(_env_file=None)  # type: ignore[call-arg]
