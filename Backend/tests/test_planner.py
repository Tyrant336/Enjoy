"""Unit tests — LangGraph plan-execute-replan planner (FR-1.1/1.2/1.5 P1).

The template planner is gone (§3.6). These tests drive the real graph with
only the OpenRouter HTTP boundary mocked (§6.5): goal/empathy and the task
breakdown arrive as structured tool payloads; goal cleaning, deadline
resolution, packing, and the replan pass are all real code under test.
"""

import json
import re
from datetime import date, timedelta
from typing import Any

import httpx2
import pytest

from app.agents.scheduler.planner import (
    DEFAULT_HOURS_PER_DAY,
    PlanRequest,
    build_plan,
)
from app.core import llm
from tests.conftest import OpenRouterHttpMock, openrouter_tool_response

TODAY = date(2026, 9, 19)

_GOAL = "study biology"
_EMPATHY = "Biology feels big right now — one small step at a time."


def req(text: str, **kwargs: object) -> PlanRequest:
    return PlanRequest.model_validate({"input": text, **kwargs})


def _tasks_spec(
    count: int, minutes: int = 20, difficulty: int = 2
) -> list[dict[str, Any]]:
    return [
        {
            "title": f"Task number {i + 1} on the topic",
            "description": f"One focused step, part {i + 1}.",
            "estimateMinutes": minutes,
            "difficulty": difficulty,
        }
        for i in range(count)
    ]


def _handler(
    tasks: list[dict[str, Any]], goal: str = _GOAL, empathy: str = _EMPATHY
):
    def handler(req_: httpx2.Request) -> httpx2.Response:
        body = json.loads(req_.content)
        tool = body["tools"][0]["function"]["name"]
        if tool == "GoalExtraction":
            return openrouter_tool_response(tool, {"goal": goal, "empathyLine": empathy})
        if tool == "TaskBreakdown":
            return openrouter_tool_response(tool, {"tasks": tasks})
        raise AssertionError(f"unexpected tool {tool}")

    return handler


def _counting_handler(req_: httpx2.Request) -> httpx2.Response:
    """Returns exactly as many tasks as the prompt requests (FR-1.2 sweep)."""
    body = json.loads(req_.content)
    tool = body["tools"][0]["function"]["name"]
    if tool == "GoalExtraction":
        return openrouter_tool_response(tool, {"goal": _GOAL, "empathyLine": _EMPATHY})
    user_msg = next(m["content"] for m in body["messages"] if m["role"] == "user")
    count = int(re.search(r"Produce exactly (\d+) tasks", user_msg).group(1))
    return openrouter_tool_response(tool, {"tasks": _tasks_spec(count)})


# ── understand node: goal/empathy/deadline ────────────────────────────────────


async def test_goal_and_empathy_come_from_the_understand_node(
    openrouter_http: OpenRouterHttpMock,
) -> None:
    openrouter_http.handler = _handler(_tasks_spec(6), goal="calculus exam prep")
    plan = await build_plan(req("I'm overwhelmed — calculus exam in 5 days"), TODAY)
    assert plan.goal == "calculus exam prep"
    assert plan.empathy_line == _EMPATHY
    assert "streak" not in plan.empathy_line  # §7.1: no pressure mechanics


async def test_deadline_phrase_in_message_is_resolved(
    openrouter_http: OpenRouterHttpMock,
) -> None:
    """D2: "in 5 days" sizes the schedule (6x45 min > 2 h/day → 3 days fit
    inside the 6-day window either way; the deadline is honored, never past)."""
    openrouter_http.handler = _handler(_tasks_spec(6, minutes=45))
    plan = await build_plan(req("calculus exam in 5 days"), TODAY)
    deadline = TODAY + timedelta(days=5)
    scheduled = [t.scheduled_for for t in plan.tasks]
    assert all(d is not None for d in scheduled)
    assert max(d for d in scheduled if d) <= deadline


async def test_explicit_deadline_beats_message_phrase(
    openrouter_http: OpenRouterHttpMock,
) -> None:
    openrouter_http.handler = _handler(_tasks_spec(6, minutes=45))
    explicit = TODAY + timedelta(days=1)  # tighter than "in 5 days"
    plan = await build_plan(
        req("calculus exam in 5 days", deadline=str(explicit)), TODAY
    )
    scheduled = [t.scheduled_for for t in plan.tasks if t.scheduled_for]
    assert max(scheduled) <= explicit  # deadline wins over the hours cap


async def test_past_deadline_is_ignored(
    openrouter_http: OpenRouterHttpMock,
) -> None:
    openrouter_http.handler = _handler(_tasks_spec(6))
    plan = await build_plan(req("study biology", deadline="2020-01-01"), TODAY)
    assert min(t.scheduled_for for t in plan.tasks if t.scheduled_for) >= TODAY


async def test_message_without_deadline_starts_today(
    openrouter_http: OpenRouterHttpMock,
) -> None:
    openrouter_http.handler = _handler(_tasks_spec(6))
    plan = await build_plan(req("study biology"), TODAY)
    assert plan.tasks[0].scheduled_for == TODAY


# ── plan node: granularity, card rules, deck request ─────────────────────────


@pytest.mark.parametrize(
    ("granularity", "count"), [(1, 3), (2, 4), (3, 6), (4, 10), (5, 15)]
)
async def test_granularity_controls_breakdown_depth(
    openrouter_http: OpenRouterHttpMock, granularity: int, count: int
) -> None:
    openrouter_http.handler = _counting_handler
    plan = await build_plan(req("study biology", granularity=granularity), TODAY)
    assert len(plan.tasks) == count
    assert plan.granularity == granularity


async def test_breakdown_outside_the_band_is_a_hard_error(
    openrouter_http: OpenRouterHttpMock,
) -> None:
    # granularity 3 band is 5-8; 2 tasks is a schema-valid but unusable answer.
    openrouter_http.handler = _handler(_tasks_spec(2))
    with pytest.raises(llm.LLMError, match="band"):
        await build_plan(req("study biology"), TODAY)


async def test_task_fields_and_dependency_chain(
    openrouter_http: OpenRouterHttpMock,
) -> None:
    openrouter_http.handler = _handler(_tasks_spec(6))
    plan = await build_plan(req("study biology"), TODAY, plan_id="plan-test-01")
    assert plan.id == "plan-test-01"
    for task in plan.tasks:
        assert task.estimate_minutes <= 45  # FR-1.1
        assert task.status == "todo"
        assert task.world_label == f"{task.title} · {task.estimate_minutes} min"
    assert plan.tasks[0].depends_on == []
    for prev, cur in zip(plan.tasks, plan.tasks[1:], strict=False):
        assert cur.depends_on == [prev.id]


async def test_exactly_one_deck_request_on_the_hardest_task(
    openrouter_http: OpenRouterHttpMock,
) -> None:
    """FR-1.4: the single hardest subtask carries the deck request."""
    tasks = _tasks_spec(6, difficulty=1)
    tasks[4]["difficulty"] = 5  # the hard one
    tasks[2]["difficulty"] = 4
    openrouter_http.handler = _handler(tasks)
    plan = await build_plan(req("study biology"), TODAY)
    with_deck = [t for t in plan.tasks if t.deck_request is not None]
    assert len(with_deck) == 1
    assert with_deck[0].deck_request is not None
    assert with_deck[0].deck_request.requested is True
    assert with_deck[0].difficulty == 5


# ── execute/replan nodes: scheduling ──────────────────────────────────────────


async def test_default_schedule_packs_into_days_from_today(
    openrouter_http: OpenRouterHttpMock,
) -> None:
    openrouter_http.handler = _handler(_tasks_spec(10, minutes=25))  # 250 min
    plan = await build_plan(req("study biology", granularity=4), TODAY)
    days = {t.scheduled_for for t in plan.tasks}
    assert len(days) >= 2  # 250 min > 2 h/day default
    for day in days:
        assert (
            sum(t.estimate_minutes for t in plan.tasks if t.scheduled_for == day)
            <= DEFAULT_HOURS_PER_DAY * 60
        )


async def test_hours_per_day_changes_packing(
    openrouter_http: OpenRouterHttpMock,
) -> None:
    openrouter_http.handler = _handler(_tasks_spec(10, minutes=25))
    plan = await build_plan(
        req("study biology", granularity=4, hours_per_day=8.0), TODAY
    )
    assert {t.scheduled_for for t in plan.tasks} == {TODAY}


async def test_replan_spreads_tasks_within_the_deadline(
    openrouter_http: OpenRouterHttpMock,
) -> None:
    """The replan node: 15x30 min greedily needs 4 days; a deadline 2 days out
    forces the even spread — nothing lands past the deadline."""
    openrouter_http.handler = _handler(_tasks_spec(15, minutes=30))
    deadline = TODAY + timedelta(days=2)
    plan = await build_plan(
        req("study biology", granularity=5, deadline=str(deadline)), TODAY
    )
    scheduled = [t.scheduled_for for t in plan.tasks]
    assert all(d is not None for d in scheduled)
    assert min(d for d in scheduled if d) >= TODAY
    assert max(d for d in scheduled if d) <= deadline


async def test_slots_do_not_repeat_within_four_tasks_a_day(
    openrouter_http: OpenRouterHttpMock,
) -> None:
    """D6 fix: slots cycle morning → afternoon → evening → night."""
    openrouter_http.handler = _handler(_tasks_spec(10, minutes=25))
    plan = await build_plan(
        req("study biology", granularity=4, hours_per_day=8.0), TODAY
    )
    slots = [t.slot for t in plan.tasks]
    assert slots[:4] == ["morning", "afternoon", "evening", "night"]


# ── request validation (boundary — §2.4) ──────────────────────────────────────


def test_invalid_requests_are_rejected() -> None:
    with pytest.raises(Exception):  # noqa: B017 — pydantic ValidationError
        PlanRequest.model_validate({"input": ""})
    with pytest.raises(Exception):  # noqa: B017
        PlanRequest.model_validate({"input": "x", "granularity": 9})
    with pytest.raises(Exception):  # noqa: B017
        PlanRequest.model_validate({"input": "x", "hoursPerDay": -1})


async def test_empty_goal_from_llm_is_a_hard_error(
    openrouter_http: OpenRouterHttpMock,
) -> None:
    """§2.4: schema-invalid extraction (empty goal) fails loudly."""
    openrouter_http.handler = _handler(_tasks_spec(6), goal="")
    with pytest.raises(llm.LLMError):
        await build_plan(req("study biology"), TODAY)
