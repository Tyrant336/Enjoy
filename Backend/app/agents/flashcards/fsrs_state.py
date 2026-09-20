"""FSRS scheduling — FR-2.8 P1: real `py-fsrs`, THE one scheduler (one path).

Per-card state lives in the `flashcards.fsrs` JSONB column. The stored dict
carries the canonical `FsrsState` keys (state/stability/difficulty/
intervalDays/reps — the frozen §5.1 contract) PLUS the extra py-fsrs fields
needed for exact reconstruction (`step`, `lastReview`); the contract parser
ignores extras at the API boundary, so the wire shape is unchanged.

Deterministic by construction: `enable_fuzzing=False` — same grade history
always yields the same schedule (no random jitter; documented choice).

Legacy-data rule (loud, documented): a stored state with `stability: null`
carries no FSRS memory to reconstruct (P0 fixed-interval grades wrote exactly
this). Such a card is treated as NEW for scheduling — the only honest reading;
nothing is silently invented.
"""

import hashlib
from datetime import UTC, datetime
from typing import Any, Literal

from fsrs import Card, Rating, Scheduler, State

Rating_ = Literal["again", "hard", "good", "easy"]

# One scheduler, one parameter set (FR-2.8 defaults; fuzzing OFF = deterministic).
_SCHEDULER = Scheduler(enable_fuzzing=False)

_RATINGS = {
    "again": Rating.Again,
    "hard": Rating.Hard,
    "good": Rating.Good,
    "easy": Rating.Easy,
}

_STATE_NAMES = {
    State.Learning: "learning",
    State.Review: "review",
    State.Relearning: "relearning",
}

_STATES_BY_NAME = {state.name.lower(): state for state in State}


def _card_int_id(card_id: str) -> int:
    return int.from_bytes(hashlib.sha256(card_id.encode()).digest()[:8])


def _to_card(card_id: str, due: datetime, fsrs: dict[str, Any]) -> Card:
    """Reconstruct a py-fsrs Card from the stored JSONB state."""
    if fsrs.get("stability") is None:
        # New card — or a P0-graded card with no FSRS memory (see docstring).
        return Card(card_id=_card_int_id(card_id), due=due)
    last_review_raw = fsrs.get("lastReview")
    if not isinstance(last_review_raw, str):
        raise ValueError(  # fail loudly — corrupt FSRS state is a data bug
            f"flashcards.fsrs for card {card_id} has stability but no "
            f"lastReview: {fsrs!r}"
        )
    state_name = str(fsrs.get("state", "review")).lower()
    try:
        state = _STATES_BY_NAME[state_name]
    except KeyError:
        raise ValueError(
            f"flashcards.fsrs for card {card_id} has unknown state "
            f"{fsrs.get('state')!r}"
        ) from None
    return Card(
        card_id=_card_int_id(card_id),
        state=state,
        step=fsrs.get("step"),
        stability=float(fsrs["stability"]),
        difficulty=(
            None
            if fsrs.get("difficulty") is None
            else float(fsrs["difficulty"])
        ),
        due=due,
        last_review=datetime.fromisoformat(last_review_raw),
    )


def apply_rating(
    card_id: str,
    due: datetime,
    fsrs: dict[str, Any],
    rating: Rating_,
    now: datetime | None = None,
) -> tuple[datetime, dict[str, Any]]:
    """Grade one card: returns (new due, new fsrs JSONB dict). Pure w.r.t.
    inputs except the injected clock."""
    now = now or datetime.now(UTC)
    card = _to_card(card_id, due, fsrs)
    updated, _review_log = _SCHEDULER.review_card(
        card, _RATINGS[rating], review_datetime=now
    )
    assert updated.last_review is not None  # py-fsrs guarantees on review
    interval_days = (updated.due - updated.last_review).total_seconds() / 86400
    new_state: dict[str, Any] = {
        # Canonical FsrsState keys (§5.1):
        "state": _STATE_NAMES[updated.state],
        "stability": updated.stability,
        "difficulty": updated.difficulty,
        "intervalDays": interval_days,
        "reps": int(fsrs.get("reps", 0)) + 1,
        # Extra py-fsrs reconstruction fields (ignored by the API contract):
        "step": updated.step,
        "lastReview": updated.last_review.isoformat(),
    }
    return updated.due, new_state
