"""Integration tests — review loop (FR-2.5/2.8/2.9) + §5.3 event ordering.

Runs against the seeded fixture user (3-card due deck "Thermo 1") on the
real Postgres test DB. The seeded cards are due NOW, so the session contains
exactly those 3 cards.
"""

import json
import uuid
from typing import Any, cast

import pytest
from httpx import AsyncClient


def H(uid: str) -> dict[str, str]:
    return {"X-Harbour-User-Id": uid}


async def _post(
    client: AsyncClient, uid: str, path: str, body: dict[str, str]
) -> dict[str, Any]:
    resp = await client.post(path, headers=H(uid), json=body)
    assert resp.status_code == 200, f"{path} → {resp.status_code}: {resp.text}"
    return cast(dict[str, Any], resp.json())


@pytest.mark.asyncio
async def test_full_review_journey_completes_deck(
    client: AsyncClient, live_client: AsyncClient, seeded_user_id: str
) -> None:
    uid = seeded_user_id

    # ── start: first due card + session progress ──
    started = await _post(client, uid, "/agents/flashcards/review/start",
                          {"deckId": "deck-thermo-1"})
    assert started["card"]["id"] == "card-thermo-01"
    assert started["progress"] == {
        "deckId": "deck-thermo-1", "total": 3, "graded": 0, "remaining": 3,
        "nextCard": started["card"], "completed": False,
    }

    # ── reveal: answer text only ──
    revealed = await _post(client, uid, "/agents/flashcards/review/reveal",
                           {"cardId": "card-thermo-01"})
    assert revealed["cardId"] == "card-thermo-01"
    assert "Energy cannot be created or destroyed" in revealed["answer"]

    # ── grade 1 (again → +5 min, not re-shown in-session, FR-2.9) ──
    g1 = await _post(client, uid, "/agents/flashcards/review/grade",
                     {"cardId": "card-thermo-01", "rating": "again"})
    assert g1["card"]["fsrsState"]["reps"] == 1
    p1 = g1["deckProgress"]
    assert (p1["total"], p1["graded"], p1["remaining"]) == (3, 1, 2)
    assert p1["nextCard"]["id"] == "card-thermo-02"  # NOT card 1 again

    # ── world-state mid-review: reviewing state survives (restart rebuild) ──
    ws = (await client.get("/api/world-state", headers=H(uid))).json()
    assert ws["reviewing"]["deckId"] == "deck-thermo-1"
    assert ws["reviewing"]["currentCard"]["id"] == "card-thermo-02"
    assert ws["reviewing"]["answerRevealed"] is False
    assert {d["id"]: d["boatState"] for d in ws["decks"]}["deck-thermo-1"] == (
        "reviewing"
    )

    # ── grade 2 (good → +3d) then exit: progress kept, resumable ──
    g2 = await _post(client, uid, "/agents/flashcards/review/grade",
                     {"cardId": "card-thermo-02", "rating": "good"})
    assert (g2["deckProgress"]["graded"], g2["deckProgress"]["remaining"]) == (2, 1)
    await _post(client, uid, "/agents/flashcards/review/exit",
                {"deckId": "deck-thermo-1"})
    ws = (await client.get("/api/world-state", headers=H(uid))).json()
    assert ws["reviewing"] is None
    assert {d["id"]: d["boatState"] for d in ws["decks"]}["deck-thermo-1"] == (
        "circle"  # still one card due → back to the circle, not docked
    )

    # ── resume + final grade → completion ──
    resumed = await _post(client, uid, "/agents/flashcards/review/start",
                          {"deckId": "deck-thermo-1"})
    assert resumed["card"]["id"] == "card-thermo-03"  # progress was kept
    assert resumed["progress"]["graded"] == 2
    g3 = await _post(client, uid, "/agents/flashcards/review/grade",
                     {"cardId": "card-thermo-03", "rating": "easy"})
    p3 = g3["deckProgress"]
    assert (p3["total"], p3["graded"], p3["remaining"]) == (3, 3, 0)
    assert p3["completed"] is True
    assert p3["nextCard"] is None

    # ── world-state: docked + record + lamp glow (same transaction) ──
    ws = (await client.get("/api/world-state", headers=H(uid))).json()
    assert {d["id"]: d["boatState"] for d in ws["decks"]}["deck-thermo-1"] == "docked"
    latest = ws["records"][0]
    assert latest["kind"] == "deck_completed"
    assert latest["refId"] == "deck-thermo-1"

    # ── SSE: the exact §5.3 event runs, ascending seq ──
    events = []
    async with live_client.stream("GET", "/api/events", headers=H(uid)) as resp:
        async for line in resp.aiter_lines():
            if line.startswith("data:"):
                events.append(json.loads(line[5:].strip()))
            if events and events[-1]["type"] == "lamp_glow":
                break
    seqs = [e["seq"] for e in events]
    assert seqs == sorted(seqs) and len(seqs) == len(set(seqs))
    types = [e["type"] for e in events]
    # start → first card (slice from the review start, robust to earlier events)
    i = types.index("enter_review_pov")
    assert types[i:i + 2] == ["enter_review_pov", "show_card"]
    # grade runs: sink/rise, sink/rise, exit, then final sink/dock/glow
    assert types[i + 2:i + 4] == ["sink_boat", "rise_boat"]
    assert types[i + 4:i + 6] == ["sink_boat", "rise_boat"]
    assert "exit_review_pov" in types
    assert types[-3:] == ["sink_boat", "dock_at_lamp", "lamp_glow"]
    assert 0.0 < events[-1]["level"] <= 1.0


@pytest.mark.asyncio
async def test_review_failure_paths_return_envelopes(
    client: AsyncClient, seeded_user_id: str
) -> None:
    uid = seeded_user_id
    # unknown deck/card → 404 envelopes
    for path, body, code in [
        ("/agents/flashcards/review/start", {"deckId": "nope"}, "DECK_NOT_FOUND"),
        ("/agents/flashcards/review/reveal", {"cardId": "nope"}, "CARD_NOT_FOUND"),
        ("/agents/flashcards/review/grade", {"cardId": "nope", "rating": "good"},
         "CARD_NOT_FOUND"),
        ("/agents/flashcards/review/exit", {"deckId": "nope"}, "DECK_NOT_FOUND"),
    ]:
        resp = await client.post(path, headers=H(uid), json=body)
        assert resp.status_code == 404
        assert resp.json()["code"] == code
        assert set(resp.json()) == {"code", "message", "detail", "recoverable"}

    # corrupt grade payload → 422 VALIDATION_ERROR envelope, never silent
    resp = await client.post(
        "/agents/flashcards/review/grade",
        headers=H(uid),
        json={"cardId": "card-thermo-01", "rating": "garbage"},
    )
    assert resp.status_code == 422
    assert resp.json()["code"] == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_start_review_with_nothing_due_is_warm_not_error(
    client: AsyncClient, seeded_user_id: str
) -> None:
    # deck-thermo-basics is completed/docked with no cards due (FR-2.5.8).
    resp = await client.post(
        "/agents/flashcards/review/start",
        headers=H(seeded_user_id),
        json={"deckId": "deck-thermo-basics"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["card"] is None
    assert body["progress"]["remaining"] == 0


@pytest.mark.asyncio
async def test_fsrs_scheduling_semantics(
    client: AsyncClient, seeded_user_id: str
) -> None:
    """FR-2.8 P1: real py-fsrs drives scheduling (the P0 fixed-interval map is
    gone). Semantics asserted, not magic numbers:
    - every grade moves `due` into the future and bumps reps;
    - again < good < easy ordering on the next-due delta;
    - easy graduates the card out of the same-minute learning steps (≥1 day);
    - the stored state gains real FSRS memory (stability/difficulty)."""
    uid = seeded_user_id
    from datetime import UTC, datetime

    async def grade_delta(card_id: str, rating: str) -> tuple[float, dict[str, Any]]:
        now = datetime.now(UTC).timestamp()
        g = await _post(client, uid, "/agents/flashcards/review/grade",
                        {"cardId": card_id, "rating": rating})
        due = datetime.fromisoformat(g["card"]["due"]).timestamp()
        return due - now, g["card"]["fsrsState"]

    again_delta, again_state = await grade_delta("card-thermo-01", "again")
    good_delta, good_state = await grade_delta("card-thermo-02", "good")
    easy_delta, easy_state = await grade_delta("card-thermo-03", "easy")

    assert 0 < again_delta < good_delta < easy_delta
    assert easy_delta >= 86400 - 120  # graduated to review, days-scale interval
    # NOTE: reps is ≥1 (not ==1) — the journey test above graded these same
    # seeded cards first; the test DB is shared per session.
    assert again_state["reps"] >= 1 and good_state["reps"] >= 1
    for st in (again_state, good_state, easy_state):
        assert st["state"] != "new"
        assert st["stability"] is not None
        assert st["difficulty"] is not None
        assert st["intervalDays"] is not None


@pytest.mark.asyncio
async def test_foreign_users_cannot_touch_seeded_cards(
    client: AsyncClient, seeded_user_id: str
) -> None:
    other = f"intruder-{uuid.uuid4().hex[:8]}"
    resp = await client.post(
        "/agents/flashcards/review/reveal",
        headers=H(other),
        json={"cardId": "card-thermo-01"},
    )
    assert resp.status_code == 404  # scoped per user — never leaks
    assert resp.json()["code"] == "CARD_NOT_FOUND"
