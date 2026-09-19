"""Unit tests — template planner (FR-1.1/1.2/1.5 P0)."""

from datetime import date

import pytest

from app.agents.scheduler.planner import (
    DEFAULT_HOURS_PER_DAY,
    PlanRequest,
    build_plan,
    extract_goal,
)

TODAY = date(2026, 9, 19)


def req(text: str, **kwargs: object) -> PlanRequest:
    return PlanRequest.model_validate({"input": text, **kwargs})


# ── goal extraction + empathy ────────────────────────────────────────────────


def test_extract_goal_strips_emotional_prefix() -> None:
    assert extract_goal("I'm afraid of revising thermodynamics") == (
        "revising thermodynamics"
    )
    assert extract_goal("help me plan my calculus exam") == "plan my calculus exam"
    assert extract_goal("thermodynamics") == "thermodynamics"


def test_empathy_line_is_warm_and_pressure_free() -> None:
    plan = build_plan(req("I'm afraid of revising thermodynamics"), TODAY)
    assert "one small step at a time" in plan.empathy_line
    assert "streak" not in plan.empathy_line  # §7.1: no pressure mechanics
    assert "revising thermodynamics" in plan.empathy_line


# ── spice levels (FR-1.2) ────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("granularity", "count"), [(1, 3), (2, 4), (3, 6), (4, 10), (5, 15)]
)
def test_granularity_controls_breakdown_depth(granularity: int, count: int) -> None:
    plan = build_plan(req("study biology", granularity=granularity), TODAY)
    assert len(plan.tasks) == count
    assert plan.granularity == granularity


def test_default_granularity_is_three() -> None:
    assert len(build_plan(req("study biology"), TODAY).tasks) == 6


def test_tasks_are_verb_first_small_and_chained() -> None:
    plan = build_plan(req("study biology", granularity=5), TODAY)
    for task in plan.tasks:
        assert task.estimate_minutes <= 45  # FR-1.1
        assert task.status == "todo"
        assert task.title[0].isupper()
        assert task.world_label is not None
    # linear dependsOn chain
    assert plan.tasks[0].depends_on == []
    for prev, cur in zip(plan.tasks, plan.tasks[1:], strict=False):
        assert cur.depends_on == [prev.id]


def test_exactly_one_task_requests_a_deck() -> None:
    # FR-1.4: the ambiguous/hard "core ideas" subtask carries deckRequest.
    plan = build_plan(req("study biology", granularity=3), TODAY)
    with_deck = [t for t in plan.tasks if t.deck_request is not None]
    assert len(with_deck) == 1
    assert with_deck[0].deck_request is not None
    assert with_deck[0].deck_request.requested is True
    assert "core ideas" in with_deck[0].title


# ── scheduling (FR-1.1) ──────────────────────────────────────────────────────


def test_default_schedule_packs_into_days_from_today() -> None:
    plan = build_plan(req("study biology", granularity=4), TODAY)
    assert all(t.scheduled_for is not None for t in plan.tasks)
    assert plan.tasks[0].scheduled_for == TODAY
    # 10 tasks, 215 min total, 2 h/day default → spans multiple days.
    days = {t.scheduled_for for t in plan.tasks}
    assert len(days) >= 2
    # per-day estimated minutes never exceed the default capacity
    for day in days:
        assert (
            sum(t.estimate_minutes for t in plan.tasks if t.scheduled_for == day)
            <= DEFAULT_HOURS_PER_DAY * 60
        )


def test_hours_per_day_changes_packing() -> None:
    plan = build_plan(req("study biology", granularity=4, hours_per_day=8.0), TODAY)
    days = {t.scheduled_for for t in plan.tasks}
    assert days == {TODAY}  # 215 min fits in one 8 h day


def test_deadline_compresses_the_schedule() -> None:
    deadline = TODAY  # everything must fit today, hours cap be damned
    plan = build_plan(
        req("study biology", granularity=4, deadline=str(deadline)), TODAY
    )
    assert {t.scheduled_for for t in plan.tasks} == {deadline}


def test_past_deadline_schedules_from_today() -> None:
    plan = build_plan(req("study biology", deadline="2020-01-01"), TODAY)
    assert min(t.scheduled_for for t in plan.tasks if t.scheduled_for) >= TODAY


def test_slots_cycle_within_a_day() -> None:
    plan = build_plan(req("study biology", granularity=4, hours_per_day=8.0), TODAY)
    slots = [t.slot for t in plan.tasks]
    assert slots[:3] == ["morning", "afternoon", "evening"]
    assert slots[3] == "morning"


# ── request validation (boundary — §2.4) ─────────────────────────────────────


def test_invalid_requests_are_rejected() -> None:
    with pytest.raises(Exception):  # noqa: B017 — pydantic ValidationError
        PlanRequest.model_validate({"input": ""})
    with pytest.raises(Exception):  # noqa: B017
        PlanRequest.model_validate({"input": "x", "granularity": 9})
    with pytest.raises(Exception):  # noqa: B017
        PlanRequest.model_validate({"input": "x", "hoursPerDay": -1})


# ── additions (Agent S, session 018 — gaps only, no duplication) ─────────────

_VERBS = {
    "Map", "List", "Explain", "Work", "Recall", "Test", "Skim", "Summarize",
    "Drill", "Redo", "Connect", "Review", "Sketch", "Do",
}


def test_every_title_starts_with_an_action_verb() -> None:
    # FR-1.1: verb-first, obviously finishable — the first WORD is the verb.
    plan = build_plan(req("study biology", granularity=5), TODAY)
    for task in plan.tasks:
        assert task.title.split()[0] in _VERBS, task.title


def test_extract_goal_never_returns_empty() -> None:
    # A message that is only a known prefix must still yield a usable goal.
    assert extract_goal("help") == "help"
    assert extract_goal("  thermodynamics  ") == "thermodynamics"


def test_empathy_line_truncates_long_goals() -> None:
    goal = "x" * 200
    plan = build_plan(req(goal), TODAY)
    assert "…" in plan.empathy_line
    assert len(plan.empathy_line) < len(goal)


def test_plan_identity_and_labels() -> None:
    plan = build_plan(req("study biology"), TODAY, plan_id="plan-test-01")
    assert plan.id == "plan-test-01"
    assert plan.goal == "study biology"
    for task in plan.tasks:
        assert task.world_label == f"{task.title} · {task.estimate_minutes} min"


def test_deadline_spreads_tasks_within_the_remaining_window() -> None:
    # 15 tasks (380 min) at the 2 h/day default greedily need 4 days; a
    # deadline 2 days out (3 days incl. today) forces the even spread — and
    # nothing may land past the deadline.
    deadline = date(2026, 9, 21)
    plan = build_plan(
        req("study biology", granularity=5, deadline=str(deadline)), TODAY
    )
    scheduled = [t.scheduled_for for t in plan.tasks]
    assert all(d is not None for d in scheduled)
    assert min(d for d in scheduled if d) >= TODAY
    assert max(d for d in scheduled if d) <= deadline
