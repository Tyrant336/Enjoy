"""Unit tests — py-fsrs state handling (FR-2.8 P1, app/agents/flashcards/fsrs_state.py).

Pure logic, no I/O: reconstruction from stored JSONB, rating application,
round-trip stability (E1: state survives a simulated restart), loud failure
on corrupt stored state.
"""

from datetime import UTC, datetime, timedelta

import pytest

from app.agents.flashcards import fsrs_state

NOW = datetime(2026, 9, 19, 12, 0, tzinfo=UTC)

NEW_STATE = {
    "state": "new",
    "stability": None,
    "difficulty": None,
    "intervalDays": None,
    "reps": 0,
}


def test_new_card_good_rating_gains_fsrs_memory() -> None:
    due, state = fsrs_state.apply_rating("card-x", NOW, NEW_STATE, "good", NOW)
    assert due > NOW
    assert state["state"] == "learning"
    assert state["reps"] == 1
    assert state["stability"] is not None
    assert state["difficulty"] is not None
    assert state["intervalDays"] is not None
    assert state["lastReview"] == NOW.isoformat()


def test_rating_ordering_on_new_cards() -> None:
    dues = {
        rating: fsrs_state.apply_rating("card-x", NOW, NEW_STATE, rating, NOW)[0]
        for rating in ("again", "hard", "good", "easy")
    }
    assert dues["again"] < dues["hard"] < dues["good"] < dues["easy"]


def test_deterministic_same_history_same_schedule() -> None:
    """Fuzzing is OFF: identical inputs produce identical outputs."""
    a = fsrs_state.apply_rating("card-x", NOW, NEW_STATE, "good", NOW)
    b = fsrs_state.apply_rating("card-x", NOW, NEW_STATE, "good", NOW)
    assert a == b


def test_round_trip_survives_reconstruction() -> None:
    """E1: state persisted as JSONB drives the NEXT review correctly — the
    simulated 'restart' is rebuilding the py-fsrs Card from the stored dict."""
    due1, state1 = fsrs_state.apply_rating("card-x", NOW, NEW_STATE, "easy", NOW)
    later = NOW + timedelta(days=5)
    due2, state2 = fsrs_state.apply_rating("card-x", due1, state1, "good", later)
    assert state2["reps"] == 2
    assert state2["state"] == "review"
    assert due2 > due1
    # A second successful review grows the interval (FSRS core property).
    assert state2["intervalDays"] > state1["intervalDays"]


def test_p0_legacy_state_is_treated_as_new() -> None:
    """Documented legacy rule: stability=None (the P0 fixed-interval writer)
    carries no FSRS memory → scheduled as a new card."""
    legacy = {
        "state": "review", "stability": None, "difficulty": None,
        "intervalDays": 3.0, "reps": 4,
    }
    due, state = fsrs_state.apply_rating("card-legacy", NOW, legacy, "good", NOW)
    assert state["reps"] == 5  # reps preserved across the interpretation
    assert state["state"] == "learning"  # scheduled as a new card


def test_corrupt_state_fails_loudly() -> None:
    corrupt = {
        "state": "review", "stability": 2.5, "difficulty": 3.0,
        "intervalDays": 1.0, "reps": 2,
        # no lastReview — cannot reconstruct → data bug, never guess
    }
    with pytest.raises(ValueError, match="lastReview"):
        fsrs_state.apply_rating("card-bad", NOW, corrupt, "good", NOW)


def test_unknown_state_name_fails_loudly() -> None:
    corrupt = {
        "state": "bogus", "stability": 2.5, "difficulty": 3.0,
        "intervalDays": 1.0, "reps": 2,
        "lastReview": NOW.isoformat(), "step": 0,
    }
    with pytest.raises(ValueError, match="unknown state"):
        fsrs_state.apply_rating("card-bad", NOW, corrupt, "good", NOW)
