"""Unit tests — review-session derivation (FR-2.9, services/review_session.py).

THE state-machine invariants, tested directly against real Postgres rows:
- the session set is exactly the cards due when the deck is opened;
- a card due in the FUTURE never sneaks into the session;
- an "Again"-graded card is in the graded set and never re-enters;
- a deck_completed record closes the old session — later grades start fresh.
"""

import uuid
from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app import models as m
from app.services.review_session import card_schema, session_state

NOW = datetime.now(UTC)


async def _deck_with_cards(
    client: AsyncClient, db_session: AsyncSession, suffix: str
) -> tuple[str, str, str, str]:
    """Fresh user + deck: card A due past, card B due future (+2 days)."""
    uid = f"rs-{suffix}-{uuid.uuid4().hex[:8]}"
    resp = await client.get("/api/world-state", headers={"X-Harbour-User-Id": uid})
    assert resp.status_code == 200
    deck_id = f"rs-deck-{uuid.uuid4().hex[:8]}"
    db_session.add(
        m.Deck(id=deck_id, user_id=uid, name="RS", boat_state="circle", apkg_url=None)
    )
    card_a, card_b = f"{deck_id}-a", f"{deck_id}-b"
    fsrs = {
        "state": "new", "stability": None, "difficulty": None,
        "intervalDays": None, "reps": 0,
    }
    db_session.add(
        m.Flashcard(id=card_a, deck_id=deck_id, user_id=uid, question="A?",
                    answer="A.", due=NOW - timedelta(minutes=5), fsrs=fsrs,
                    source_snippet=None)
    )
    db_session.add(
        m.Flashcard(id=card_b, deck_id=deck_id, user_id=uid, question="B?",
                    answer="B.", due=NOW + timedelta(days=2), fsrs=fsrs,
                    source_snippet=None)
    )
    await db_session.commit()
    return uid, deck_id, card_a, card_b


def _grade(uid: str, deck_id: str, card_id: str) -> m.ReviewEvent:
    return m.ReviewEvent(user_id=uid, card_id=card_id, deck_id=deck_id, rating="again")


async def test_ungraded_session_contains_only_due_cards(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    uid, deck_id, card_a, card_b = await _deck_with_cards(client, db_session, "due")
    state = await session_state(db_session, uid, deck_id, NOW)
    assert [c.id for c in state.remaining] == [card_a], "future card stays out"
    assert state.graded_ids == set()
    assert state.total == 1
    assert state.completed is False


async def test_again_graded_card_never_reenters_and_future_card_excluded(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    uid, deck_id, card_a, card_b = await _deck_with_cards(client, db_session, "again")
    db_session.add(_grade(uid, deck_id, card_a))  # "again" — schedules sooner
    await db_session.commit()

    state = await session_state(db_session, uid, deck_id, NOW)
    assert state.graded_ids == {card_a}
    assert state.remaining == [], "graded once = out of this session (FR-2.9)"
    assert card_b not in {c.id for c in state.remaining}
    assert state.total == 1
    assert state.completed is True, "all initially-due cards graded once → done"


async def test_deck_completed_record_closes_the_session(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    uid, deck_id, card_a, _ = await _deck_with_cards(client, db_session, "reset")
    db_session.add(_grade(uid, deck_id, card_a))
    await db_session.commit()
    first = await session_state(db_session, uid, deck_id, NOW)
    assert first.completed is True

    # The completion record lands: any grade BEFORE it no longer counts.
    db_session.add(
        m.Record(
            id=f"rec-{uuid.uuid4().hex[:8]}", user_id=uid, kind="deck_completed",
            ref_id=deck_id, title="RS",
        )
    )
    await db_session.commit()
    fresh = await session_state(db_session, uid, deck_id, NOW)
    assert fresh.graded_ids == set(), "a new session starts after the record"
    assert fresh.completed is False


async def test_card_schema_maps_orm_to_contract(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, _, card_a, _ = await _deck_with_cards(client, db_session, "map")
    from sqlalchemy import select

    row = (
        await db_session.execute(select(m.Flashcard).where(m.Flashcard.id == card_a))
    ).scalar_one()
    card = card_schema(row)
    assert card.id == card_a
    assert card.fsrs_state.state == "new"
    assert card.fsrs_state.reps == 0
