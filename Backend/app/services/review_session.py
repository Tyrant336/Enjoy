"""Review-session derivation — shared service (FR-2.9), no agent deps.

THE one place the current review session is computed (used by the Flashcard
Agent's review module AND by world-state assembly — split-brain forbidden,
AGENTS.md §1.7). See app/agents/flashcards/review.py for the session rules.

Derivation (no session table — §4.5 entities are the v1 minimum):
- Session start = first grade after the deck's last `deck_completed` record.
- Session set ("cards due when the deck is opened", FR-2.9) = every card
  graded this session (it was due at open by definition — grading moves its
  `due` forward, which must NOT shrink the session) - ungraded cards whose
  `due` is at/before session start (their `due` has not moved, so this is
  exact; an "Again"-graded card is in the graded set and never re-enters).
- Remaining = session set minus graded set; session size stays stable.
"""

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models as m
from app import schemas as s


class SessionState:
    def __init__(
        self, graded_ids: set[str], remaining: list[m.Flashcard], total: int
    ) -> None:
        self.graded_ids = graded_ids
        self.remaining = remaining
        self.total = total

    @property
    def completed(self) -> bool:
        return bool(self.graded_ids) and not self.remaining


async def session_state(
    session: AsyncSession, user_id: str, deck_id: str, now: datetime
) -> SessionState:
    last_completion = (
        await session.execute(
            select(func.max(m.Record.at)).where(
                m.Record.user_id == user_id,
                m.Record.kind == "deck_completed",
                m.Record.ref_id == deck_id,
            )
        )
    ).scalar_one()
    grades_query = select(m.ReviewEvent).where(
        m.ReviewEvent.user_id == user_id, m.ReviewEvent.deck_id == deck_id
    )
    if last_completion is not None:
        grades_query = grades_query.where(m.ReviewEvent.graded_at > last_completion)
    grades = (await session.execute(grades_query)).scalars().all()

    graded_ids = {g.card_id for g in grades}
    session_start = min((g.graded_at for g in grades), default=now)

    cards = (
        (
            await session.execute(
                select(m.Flashcard)
                .where(m.Flashcard.deck_id == deck_id)
                .order_by(m.Flashcard.due, m.Flashcard.id)
            )
        )
        .scalars()
        .all()
    )
    ungraded_remaining = [
        c for c in cards if c.id not in graded_ids and c.due <= session_start
    ]
    total = len(graded_ids) + len(ungraded_remaining)
    return SessionState(graded_ids, ungraded_remaining, total=total)


def card_schema(c: m.Flashcard) -> s.Flashcard:
    """THE one ORM→contract mapping for Flashcard."""
    return s.Flashcard(
        id=c.id,
        deck_id=c.deck_id,
        question=c.question,
        answer=c.answer,
        due=c.due,
        fsrs_state=s.FsrsState.model_validate(c.fsrs),
    )
