"""Flashcard Agent — review sessions (FR-2.5, FR-2.8, FR-2.9).

Scheduling (FR-2.8 P1): real `py-fsrs` via `fsrs_state.apply_rating` — THE
one scheduler; per-card state persists in `flashcards.fsrs` JSONB. The P0
fixed-interval map is gone (P1 replaces it; §3.6 kill, don't accumulate).

Review-session rule (FR-2.9, unchanged): a session contains exactly the cards
due when the deck is opened; each due card is shown ONCE per session (an
"Again" grade schedules it sooner but does NOT re-show it in-session); when
every initially-due card has been graded once, the deck completes (FR-2.6).

Session state is DERIVED from the append-only `review_events` log + the
`records` journal via `app/services/review_session.py` (the ONE derivation,
shared with world-state assembly):
- A session starts at the first grade after the deck's last `deck_completed`
  record (or ever). "Cards due when the deck is opened" = cards whose `due`
  is at/before that first grade's instant — for ungraded cards `due` has not
  moved since session start, so this is exact; an "Again"-graded card is in
  `graded_ids`, so it can never re-enter the session's remaining set.
- Exit keeps progress: exiting writes no session marker, so the derived
  session simply continues when the user returns (FR-2.5.6).

Called by the review API and (Phase 2+) the Orchestrator only — never by
another agent directly (AGENTS.md §4.3).
"""

import uuid
from datetime import UTC, datetime
from typing import Literal

from pydantic import Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models as m
from app import schemas as s
from app.agents.flashcards import fsrs_state
from app.core.errors import AppError
from app.services import outbox
from app.services.review_session import SessionState, card_schema, session_state
from app.services.world_state import LAMP_GLOW_PER_RECORD

Rating = Literal["again", "hard", "good", "easy"]

# FR-2.5.8 — nothing due (warm, never pressure).
NOTHING_DUE_MESSAGE = "Nothing is waiting for you right now. Your harbour can rest."


# ── request/response models (endpoint payloads — not part of the frozen
#    contract; the contract fixes only "updated card + deck progress") ────────


class DeckProgress(s.ContractModel):
    deck_id: str
    total: int  # session size = initially-due cards (FR-2.9)
    graded: int  # cards graded once so far this session
    remaining: int
    next_card: s.Flashcard | None
    completed: bool


class ReviewStartResponse(s.ContractModel):
    deck_id: str
    card: s.Flashcard | None  # first card to show; null = nothing due
    progress: DeckProgress


class RevealRequest(s.ContractModel):
    card_id: str


class RevealResponse(s.ContractModel):
    card_id: str
    answer: str


class GradeRequest(s.ContractModel):
    card_id: str
    rating: Rating


class GradeResponse(s.ContractModel):
    card: s.Flashcard
    deck_progress: DeckProgress


class ExitRequest(s.ContractModel):
    deck_id: str


class ExitResponse(s.ContractModel):
    deck_id: str



def _progress(deck_id: str, state: SessionState) -> DeckProgress:
    return DeckProgress(
        deck_id=deck_id,
        total=state.total,
        graded=len(state.graded_ids),
        remaining=len(state.remaining),
        next_card=card_schema(state.remaining[0]) if state.remaining else None,
        completed=state.completed,
    )


async def _get_deck(session: AsyncSession, user_id: str, deck_id: str) -> m.Deck:
    deck = (
        await session.execute(
            select(m.Deck).where(m.Deck.id == deck_id, m.Deck.user_id == user_id)
        )
    ).scalar_one_or_none()
    if deck is None:
        raise AppError(
            404,
            "DECK_NOT_FOUND",
            "That deck does not exist in your harbour.",
            detail={"deckId": deck_id},
        )
    return deck


async def _get_card(session: AsyncSession, user_id: str, card_id: str) -> m.Flashcard:
    card = (
        await session.execute(
            select(m.Flashcard).where(
                m.Flashcard.id == card_id, m.Flashcard.user_id == user_id
            )
        )
    ).scalar_one_or_none()
    if card is None:
        raise AppError(
            404,
            "CARD_NOT_FOUND",
            "That card does not exist in your harbour.",
            detail={"cardId": card_id},
        )
    return card


# ── review actions (each called inside ONE txn owned by the endpoint) ────────


async def start_review(
    session: AsyncSession, user: m.User, deck_id: str
) -> ReviewStartResponse:
    """Open a deck for review: emits enter_review_pov + show_card for the
    first due card. With nothing due, emits the FR-2.5.8 narrate instead."""
    deck = await _get_deck(session, user.id, deck_id)
    now = datetime.now(UTC)
    state = await session_state(session, user.id, deck_id, now)

    if not state.remaining:
        await outbox.emit(session, user.id, [outbox.narrate(NOTHING_DUE_MESSAGE)])
        return ReviewStartResponse(
            deck_id=deck_id, card=None, progress=_progress(deck_id, state)
        )

    deck.boat_state = "reviewing"
    first = state.remaining[0]
    await outbox.emit(
        session,
        user.id,
        [outbox.enter_review_pov(deck_id), outbox.show_card(deck_id, card_schema(first))],
    )
    return ReviewStartResponse(
        deck_id=deck_id, card=card_schema(first), progress=_progress(deck_id, state)
    )


async def reveal(session: AsyncSession, user: m.User, card_id: str) -> RevealResponse:
    """FR-2.5.3 — answer text for a card the FE is already showing (§5.2)."""
    card = await _get_card(session, user.id, card_id)
    return RevealResponse(card_id=card.id, answer=card.answer)


async def grade(
    session: AsyncSession, user: m.User, card_id: str, rating: Rating
) -> GradeResponse:
    """FR-2.5.5/2.8/2.9 — persist the grade, then emit the visual run.

    ONE transaction (§5.3): card + review_event (+ record on completion) and
    the outbox events commit together. Final card of a session →
    sink_boat → dock_at_lamp → lamp_glow; otherwise sink_boat → rise_boat.

    py-fsrs computes the next due from the card's stored FSRS state
    (fsrs_state.py, FR-2.8 P1); the FR-2.9 session rule below is unchanged.
    """
    card = await _get_card(session, user.id, card_id)
    deck = await _get_deck(session, user.id, card.deck_id)
    now = datetime.now(UTC)

    card.due, card.fsrs = fsrs_state.apply_rating(
        card.id, card.due, card.fsrs, rating, now
    )
    session.add(
        m.ReviewEvent(
            user_id=user.id, card_id=card.id, deck_id=deck.id, rating=rating
        )
    )
    await session.flush()

    state = await session_state(session, user.id, deck.id, now)
    progress = _progress(deck.id, state)

    if state.completed:
        deck.boat_state = "docked"
        record = m.Record(
            id=f"rec-{uuid.uuid4().hex[:12]}",
            user_id=user.id,
            kind="deck_completed",
            ref_id=deck.id,
            title=deck.name,
        )
        session.add(record)
        await session.flush()
        record_count = (
            await session.execute(
                select(func.count())
                .select_from(m.Record)
                .where(m.Record.user_id == user.id)
            )
        ).scalar_one()
        level = min(1.0, record_count * LAMP_GLOW_PER_RECORD)
        await outbox.emit(
            session,
            user.id,
            [
                outbox.sink_boat(),
                outbox.dock_at_lamp(deck.id),
                outbox.lamp_glow(level),
            ],
        )
    else:
        deck.boat_state = "reviewing"
        next_card = state.remaining[0]
        await outbox.emit(
            session,
            user.id,
            [outbox.sink_boat(), outbox.rise_boat(card_schema(next_card))],
        )

    return GradeResponse(card=card_schema(card), deck_progress=progress)


async def exit_review(session: AsyncSession, user: m.User, deck_id: str) -> ExitResponse:
    """FR-2.5.6 — leave review POV; progress is kept (review_events are
    append-only and untouched), the deck is resumable (FR-2.9)."""
    deck = await _get_deck(session, user.id, deck_id)
    now = datetime.now(UTC)
    if deck.boat_state == "reviewing":
        state = await session_state(session, user.id, deck_id, now)
        deck.boat_state = "circle" if state.remaining else "docked"
    await outbox.emit(session, user.id, [outbox.exit_review_pov()])
    return ExitResponse(deck_id=deck_id)


class StartRequest(s.ContractModel):
    """POST /agents/flashcards/review/start body.

    NOTE (documented in session 016): §5.2 lists reveal/grade/exit but no
    session-start call; without one the FE cannot learn the FIRST due card
    (cards 2..N arrive via grade's deckProgress.nextCard / rise_boat).
    This endpoint mirrors exit's `{deckId}` shape exactly — proposed contract
    amendment, monitor to ratify.
    """

    deck_id: str = Field(min_length=1)
