"""Unit tests — event outbox (§5.3): seq monotonicity + payload builders.

The outbox is THE one way WorldEvents are emitted; these tests pin the
invariants the FE depends on: per-user monotonic seq ACROSS transactions,
payloads stamped with id/seq in order, and the §5.3 union shapes verbatim.
"""

import uuid
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models as m
from app import schemas as s
from app.services import outbox


async def _fresh_user(client: AsyncClient) -> str:
    """First-seen user upsert (§4.4) so outbox rows have their FK target."""
    uid = f"outbox-test-{uuid.uuid4().hex[:8]}"
    resp = await client.get("/api/world-state", headers={"X-Harbour-User-Id": uid})
    assert resp.status_code == 200
    return uid


# ── seq monotonicity (§5.3 — per-user, gap-free across committed txns) ───────


async def test_emit_assigns_monotonic_seqs_across_transactions(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    uid = await _fresh_user(client)

    seqs1 = await outbox.emit(
        db_session, uid, [outbox.narrate("one"), outbox.sink_boat()]
    )
    await db_session.commit()
    seqs2 = await outbox.emit(db_session, uid, [outbox.tour_end()])
    await db_session.commit()

    assert seqs1 == [1, 2]
    assert seqs2 == [3], "seq continues across transactions, never restarts"

    rows = (
        (
            await db_session.execute(
                select(m.EventOutbox)
                .where(m.EventOutbox.user_id == uid)
                .order_by(m.EventOutbox.seq)
            )
        )
        .scalars()
        .all()
    )
    assert [r.seq for r in rows] == [1, 2, 3]
    payloads = [r.payload for r in rows]
    assert [p["seq"] for p in payloads] == [1, 2, 3], "payload seq matches row seq"
    assert [p["type"] for p in payloads] == ["narrate", "sink_boat", "tour_end"]
    assert len({p["id"] for p in payloads}) == 3, "event ids are unique"
    assert all(p["id"].startswith("evt-") for p in payloads)


async def test_emit_empty_list_is_a_noop(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    uid = await _fresh_user(client)
    assert await outbox.emit(db_session, uid, []) == []
    count = (
        await db_session.execute(
            select(m.EventOutbox).where(m.EventOutbox.user_id == uid)
        )
    ).scalars().all()
    assert count == []


async def test_seq_is_per_user_not_global(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    uid_a = await _fresh_user(client)
    uid_b = await _fresh_user(client)
    await outbox.emit(db_session, uid_a, [outbox.narrate("a1"), outbox.narrate("a2")])
    await db_session.commit()
    seqs_b = await outbox.emit(db_session, uid_b, [outbox.narrate("b1")])
    await db_session.commit()
    assert seqs_b == [1], "each user has their own seq line (§5.3)"


# ── builder guards + §5.3 union shapes ───────────────────────────────────────


def test_camera_fly_to_enforces_min_duration() -> None:
    with pytest.raises(ValueError, match="≥1500"):
        outbox.camera_fly_to("fishboat", "fishboat", duration_ms=800)
    ok = outbox.camera_fly_to("lamp", "overview", duration_ms=1500)
    assert ok == {
        "type": "camera_fly_to",
        "target": "lamp",
        "preset": "overview",
        "durationMs": 1500,
    }


def test_simple_builders_match_the_union_verbatim() -> None:
    assert outbox.sink_boat() == {"type": "sink_boat"}
    assert outbox.exit_review_pov() == {"type": "exit_review_pov"}
    assert outbox.tour_end() == {"type": "tour_end"}
    assert outbox.highlight("fishboat") == {"type": "highlight", "target": "fishboat"}
    assert outbox.enter_review_pov("deck-1") == {
        "type": "enter_review_pov",
        "deckId": "deck-1",
    }
    assert outbox.dock_at_lamp("deck-1") == {"type": "dock_at_lamp", "deckId": "deck-1"}
    assert outbox.lamp_glow(0.5) == {"type": "lamp_glow", "level": 0.5}
    assert outbox.tour_offer("road-1") == {"type": "tour_offer", "roadmapId": "road-1"}
    assert outbox.error("mist") == {"type": "error", "message": "mist"}


def test_complex_builders_serialize_camelcase_contracts() -> None:
    deck = s.Deck(
        id="deck-1", name="D", boat_state="circle",
        card_count=3, due_today=3, apkg_url=None,
    )
    payload = outbox.spawn_boat(deck)
    assert payload["deck"]["boatState"] == "circle"  # camelCase (§5.1)
    assert "boat_state" not in payload["deck"]

    card = s.Flashcard(
        id="c1", deck_id="deck-1", question="Q?", answer="A.",
        due=datetime(2026, 9, 19, 18, 0, tzinfo=UTC),
        fsrs_state=s.FsrsState(
            state="new", stability=None, difficulty=None,
            interval_days=None, reps=0,
        ),
    )
    shown = outbox.show_card("deck-1", card)
    assert shown["card"]["deckId"] == "deck-1"
    assert shown["card"]["fsrsState"]["state"] == "new"
    risen = outbox.rise_boat(card)
    assert risen["type"] == "rise_boat" and risen["card"]["id"] == "c1"

    roadmap = s.Roadmap(id="road-1", plan_id="plan-1", steps=[])
    assert outbox.tour_start(roadmap)["roadmap"]["planId"] == "plan-1"
