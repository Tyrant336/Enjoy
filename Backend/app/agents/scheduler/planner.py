"""LangGraph plan-execute-replan planner — FR-1.5 P1. THE planner (one path).

The P0 deterministic template planner is DELETED (§3.6 kill, don't
accumulate) — this graph is the only breakdown engine. The canonical
`StudyPlan` output contract (schemas.py) is UNCHANGED.

Graph (pattern: opensource/01-scheduler-fishboat/langgraph-plan-and-execute):

    understand ──► plan ──► execute ──► replan ──► END
    (LLM: goal +   (LLM: topic-   (deterministic  (deterministic:
     empathy,       specific       greedy day-     deadline unmet →
     kills D1/D3)   breakdown,     packing)        even spread;
                    kills D5)                       else pass)

- Goal extraction is an LLM structured-output node: emotional preamble
  ("I'm overwhelmed") and zone words ("fishboat") are stripped from the goal
  (eval defects D1/D3, session 025). Schema mismatch = loud LLMError (§2.4).
- Deadlines: explicit `request.deadline` wins; otherwise the ONE date-phrase
  resolver (`scripts/seed_dates.resolve_natural_date`) parses "in 5 days" /
  "next month" from the message (D2). A past deadline is unmeetable input —
  ignored, scheduled from today (documented P0 behavior, kept).
- FR-1.4 deck request: the single hardest subtask (max difficulty, first on
  ties) carries `deckRequest` — deterministic rule, documented.
- Slots (D6 fix): morning → afternoon → evening → night within a day.
"""

import logging
import uuid
from datetime import date, timedelta
from typing import TypedDict, cast

from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph
from pydantic import Field

from app.core import llm
from app.schemas import ContractModel, DeckRequest, StudyPlan, StudyTask
from scripts.seed_dates import resolve_natural_date

logger = logging.getLogger("enjoy.scheduler.planner")

DEFAULT_GRANULARITY = 3  # FR-1.2
DEFAULT_HOURS_PER_DAY = 2.0

# Target task count per spice level (FR-1.2: 1 = 3-5 broad steps …
# 5 = 15-20 micro-steps) with the acceptance band the LLM output must land in.
_GRANULARITY_TARGET = {1: 3, 2: 4, 3: 6, 4: 10, 5: 15}
_GRANULARITY_BAND = {1: (3, 5), 2: (4, 7), 3: (5, 8), 4: (8, 12), 5: (13, 20)}

_SLOTS = ("morning", "afternoon", "evening", "night")  # D6: no same-day repeat ≤4

MAX_TASK_MINUTES = 45  # FR-1.1


class PlanRequest(ContractModel):
    """POST /agents/scheduler/plan body (§5.2, FR-1.1)."""

    input: str = Field(min_length=1)
    granularity: int = Field(default=DEFAULT_GRANULARITY, ge=1, le=5)
    deadline: date | None = None
    hours_per_day: float | None = Field(default=None, gt=0, le=16)


class GoalExtraction(ContractModel):
    """LLM output of the `understand` node."""

    goal: str = Field(min_length=1, max_length=120)
    empathy_line: str = Field(min_length=1, max_length=300)


class PlannedTask(ContractModel):
    """LLM output of the `plan` node, per task."""

    title: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=400)
    estimate_minutes: int = Field(ge=5, le=MAX_TASK_MINUTES)
    difficulty: int = Field(ge=1, le=5)


class TaskBreakdown(ContractModel):
    tasks: list[PlannedTask] = Field(min_length=1)


class _PlanState(TypedDict):
    request: PlanRequest
    today: date
    plan_id: str
    goal: str
    empathy_line: str
    deadline: date | None
    tasks: list[StudyTask]


# ── prompts ───────────────────────────────────────────────────────────────────

_UNDERSTAND_SYSTEM = """\
You are the Scheduler Agent of a calm study app (a safe harbour for stressed \
students). From the student's message extract:
- goal: the pure learning goal, 2-10 words, no emotional preamble ("I'm \
overwhelmed", "I'm afraid of"), no app-zone words (fishboat, small boats, \
atlas, underwater, lamp, journal), no scheduling meta ("in 5 days"). Just \
the topic and intent, e.g. "prepare for the calculus exam".
- empathyLine: ONE warm sentence acknowledging the feeling, never pressure, \
never guilt, never mention streaks or deadlines as threats."""

_PLAN_SYSTEM = """\
You are the Scheduler Agent of a calm study app. Break the student's learning \
goal into small study tasks (goblin.tools Magic ToDo style).

Hard rules (violations are rejected):
- Each task: verb-first title, ≤45 minutes, obviously finishable, concrete \
and SPECIFIC to the topic (never generic filler like "review your notes").
- description: one sentence on how to do it.
- difficulty: 1 (easy) to 5 (hard).
- Pedagogical order: survey → vocabulary → understand → practice → recall → \
consolidate.
- Produce EXACTLY the requested number of tasks."""


# ── nodes ─────────────────────────────────────────────────────────────────────


async def _understand(state: _PlanState) -> dict[str, object]:
    request = state["request"]
    extraction = await llm.structured(
        GoalExtraction,
        system=_UNDERSTAND_SYSTEM,
        user=f"Message: {request.input}",
    )
    # Deadline: explicit request field wins; else the ONE phrase resolver (D2).
    deadline = request.deadline or resolve_natural_date(request.input, state["today"])
    if deadline is not None and deadline < state["today"]:
        logger.info("planner: past deadline %s ignored as unmeetable", deadline)
        deadline = None
    logger.info(
        "planner understand: goal=%r deadline=%s", extraction.goal, deadline
    )
    return {
        "goal": extraction.goal,
        "empathy_line": extraction.empathy_line,
        "deadline": deadline,
    }


async def _plan(state: _PlanState) -> dict[str, object]:
    request = state["request"]
    target = _GRANULARITY_TARGET[request.granularity]
    breakdown = await llm.structured(
        TaskBreakdown,
        system=_PLAN_SYSTEM,
        user=(
            f"Goal: {state['goal']}\n"
            f"Produce exactly {target} tasks "
            f"(spice level {request.granularity} of 5)."
        ),
    )
    low, high = _GRANULARITY_BAND[request.granularity]
    if not low <= len(breakdown.tasks) <= high:
        raise llm.LLMError(
            f"Task breakdown returned {len(breakdown.tasks)} tasks for "
            f"granularity {request.granularity} (accepted band {low}-{high}).",
            payload=breakdown.model_dump(mode="json"),
        )

    # FR-1.4: the single hardest subtask may want a deck (deterministic rule).
    hardest = max(
        range(len(breakdown.tasks)),
        key=lambda i: breakdown.tasks[i].difficulty,
    )
    plan_id = state["plan_id"]
    tasks: list[StudyTask] = []
    previous_id: str | None = None
    for i, planned in enumerate(breakdown.tasks):
        task_id = f"{plan_id}-t{i + 1:02d}"
        tasks.append(
            StudyTask(
                id=task_id,
                title=planned.title,
                description=planned.description,
                estimate_minutes=planned.estimate_minutes,
                difficulty=planned.difficulty,
                status="todo",
                scheduled_for=None,  # assigned by execute/replan
                slot=None,
                depends_on=[previous_id] if previous_id else [],
                deck_request=(
                    DeckRequest(requested=True, topic=state["goal"])
                    if i == hardest
                    else None
                ),
                world_label=f"{planned.title} · {planned.estimate_minutes} min",
            )
        )
        previous_id = task_id
    return {"tasks": tasks}


def _assign_days(tasks: list[StudyTask], days: list[list[int]], today: date) -> None:
    for day_offset, indexes in enumerate(days):
        for slot_index, task_index in enumerate(indexes):
            task = tasks[task_index]
            task.scheduled_for = today + timedelta(days=day_offset)
            task.slot = _SLOTS[slot_index % len(_SLOTS)]


def _greedy_days(tasks: list[StudyTask], hours_per_day: float) -> list[list[int]]:
    """Pack tasks into days up to the hours-per-day capacity (in order)."""
    capacity = int(hours_per_day * 60)
    days: list[list[int]] = []
    current: list[int] = []
    used = 0
    for i, task in enumerate(tasks):
        if current and used + task.estimate_minutes > capacity:
            days.append(current)
            current, used = [], 0
        current.append(i)
        used += task.estimate_minutes
    if current:
        days.append(current)
    return days


async def _execute(state: _PlanState) -> dict[str, object]:
    """Executor: greedy day-packing from TODAY at the hours-per-day cap."""
    hours = state["request"].hours_per_day or DEFAULT_HOURS_PER_DAY
    _assign_days(state["tasks"], _greedy_days(state["tasks"], hours), state["today"])
    return {"tasks": state["tasks"]}


async def _replan(state: _PlanState) -> dict[str, object]:
    """Replanner: if the greedy plan overruns the deadline, spread the tasks
    evenly across the remaining days (deadline wins over the hours cap —
    documented behavior). Otherwise the plan stands (single replan pass)."""
    deadline = state["deadline"]
    tasks = state["tasks"]
    if deadline is None or not tasks:
        return {"tasks": tasks}
    last_day = max(t.scheduled_for for t in tasks if t.scheduled_for)
    if last_day is None or last_day <= deadline:
        return {"tasks": tasks}
    days_available = (deadline - state["today"]).days + 1
    logger.info(
        "planner replan: greedy plan overruns deadline %s — spreading over %d days",
        deadline, days_available,
    )
    per_day = -(-len(tasks) // days_available)  # ceil
    days = [
        list(range(start, min(start + per_day, len(tasks))))
        for start in range(0, len(tasks), per_day)
    ]
    _assign_days(tasks, days, state["today"])
    return {"tasks": tasks}


_PlanGraph = CompiledStateGraph[_PlanState, None, _PlanState, _PlanState]


def _build_graph() -> _PlanGraph:
    graph = StateGraph(_PlanState)
    graph.add_node("understand", _understand)
    graph.add_node("plan", _plan)
    graph.add_node("execute", _execute)
    graph.add_node("replan", _replan)
    graph.add_edge(START, "understand")
    graph.add_edge("understand", "plan")
    graph.add_edge("plan", "execute")
    graph.add_edge("execute", "replan")
    graph.add_edge("replan", END)
    return cast(_PlanGraph, graph.compile())


_PLAN_GRAPH = _build_graph()


async def build_plan(
    request: PlanRequest,
    today: date,
    plan_id: str | None = None,
) -> StudyPlan:
    """Build the canonical StudyPlan via the plan-execute-replan graph.
    Clock injected via `today`; LLM failures raise LLMError (loud)."""
    plan_id = plan_id or f"plan-{uuid.uuid4().hex[:8]}"
    result = await _PLAN_GRAPH.ainvoke(
        {
            "request": request,
            "today": today,
            "plan_id": plan_id,
            "goal": "",
            "empathy_line": "",
            "deadline": None,
            "tasks": [],
        }
    )
    return StudyPlan(
        id=plan_id,
        goal=str(result["goal"]),
        empathy_line=str(result["empathy_line"]),
        granularity=request.granularity,
        tasks=[StudyTask.model_validate(t) for t in result["tasks"]],
    )
