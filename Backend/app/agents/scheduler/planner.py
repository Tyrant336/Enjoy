"""Template planner — FR-1.5 P0. THE planner (one path, not a mode).

Deterministic, goblin.tools-style (obsidian-magic-tasks pattern, 01-distill):
emotional/vague input → (a) one warm empathy line, (b) a verb-first task
breakdown sized by spice level 1-5 (FR-1.2), (c) a schedule sized to
deadline / hours-per-day with sensible defaults (FR-1.1).

Full LangGraph plan-execute-replan replaces the internals in P1 — the
canonical StudyPlan output contract does not change. No LLM calls here; no
input ever "falls back" to anything — every input gets the same honest
template treatment.

Scheduling rules (deterministic, documented):
- Tasks pack greedily into days starting TODAY (user-local, passed in) up to
  `hours_per_day` (default 2.0 h) of estimated minutes per day.
- Slots cycle morning → afternoon → evening within each day.
- With a deadline: if the greedy plan needs more days than remain (deadline
  day inclusive), tasks are spread evenly across the remaining days instead
  (deadline wins over the hours cap — documented). A past deadline schedules
  everything starting today, deadline ignored as unmeetable input.
"""

import uuid
from datetime import date, timedelta

from pydantic import Field

from app.schemas import ContractModel, DeckRequest, StudyPlan, StudyTask

DEFAULT_GRANULARITY = 3  # FR-1.2
DEFAULT_HOURS_PER_DAY = 2.0

# How many template steps each spice level expands to (FR-1.2:
# 1 = 3-5 broad steps … 5 = 15-20 micro-steps).
_GRANULARITY_TASK_COUNT = {1: 3, 2: 4, 3: 6, 4: 10, 5: 15}

# Verb-first, ≤45 min, obviously finishable (FR-1.1). Pedagogical order:
# survey → vocabulary → understand → practice → recall → consolidate.
# (title template, minutes, difficulty 1-5)
_TASK_TEMPLATES: list[tuple[str, int, int]] = [
    ("Map the big picture of {topic}", 15, 1),
    ("List the key terms of {topic}", 15, 2),
    ("Explain the core ideas of {topic} in your own words", 25, 3),
    ("Work through {topic} examples step by step", 30, 3),
    ("Recall {topic} from memory on a blank page", 20, 3),
    ("Test yourself on {topic} with practice questions", 30, 4),
    ("Skim your {topic} notes and mark what feels shaky", 15, 2),
    ("Summarize {topic} on one page", 20, 3),
    ("Drill your {topic} flashcards for ten minutes", 10, 1),
    ("Redo the {topic} problems you missed", 25, 4),
    ("Connect {topic} to things you already know", 15, 3),
    ("Explain {topic} out loud in five sentences", 15, 2),
    ("Review your weak spots in {topic}", 25, 2),
    ("Sketch a {topic} cheat-sheet from memory", 20, 3),
    ("Do one final light recall of {topic}", 10, 1),
]

# FR-1.4: the "explain the core ideas" step is the ambiguous/hard subtask that
# may want a flashcard deck (via the Orchestrator only — never directly).
_DECK_REQUEST_TEMPLATE_INDEX = 2

# Leading filler stripped to find the goal inside an emotional message.
_GOAL_PREFIXES = (
    "i'm afraid of ", "im afraid of ", "i am afraid of ", "afraid of ",
    "i'm scared of ", "im scared of ", "i am scared of ", "scared of ",
    "i'm worried about ", "im worried about ", "worried about ",
    "i don't know how to ", "i dont know how to ", "i don't know ",
    "can you help me ", "could you help me ", "help me ", "help ",
    "i need to ", "i want to ", "i have to ", "i must ", "i really need to ",
    "please help me ", "please ", "how do i ", "how can i ", "teach me ",
)

_SLOTS = ("morning", "afternoon", "evening")


class PlanRequest(ContractModel):
    """POST /agents/scheduler/plan body (§5.2, FR-1.1)."""

    input: str = Field(min_length=1)
    granularity: int = Field(default=DEFAULT_GRANULARITY, ge=1, le=5)
    deadline: date | None = None
    hours_per_day: float | None = Field(default=None, gt=0, le=16)


def extract_goal(message: str) -> str:
    """Best-effort deterministic goal extraction: strip known emotional
    prefixes and punctuation; fall back to the full message (never empty)."""
    text = " ".join(message.strip().split())
    lowered = text.lower()
    for prefix in _GOAL_PREFIXES:
        if lowered.startswith(prefix):
            text = text[len(prefix):]
            break
    return text.strip(" .!?") or message.strip()


def _empathy_line(goal: str) -> str:
    short = goal if len(goal) <= 60 else goal[:57].rstrip() + "…"
    return f"{short} feels big right now — we'll take it one small step at a time."


def _schedule(
    tasks: list[StudyTask],
    today: date,
    deadline: date | None,
    hours_per_day: float,
) -> None:
    """Assign scheduledFor + slot in place (see module docstring for rules)."""
    capacity = int(hours_per_day * 60)
    # Greedy packing into days: list of (date, minutes_used).
    days: list[list[int]] = []  # per-day task indexes
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

    if deadline is not None and deadline >= today:
        days_available = (deadline - today).days + 1
        if len(days) > days_available:
            # Deadline wins over the hours cap: spread evenly across what
            # remains (documented in the module docstring).
            per_day = -(-len(tasks) // days_available)  # ceil
            days = [
                list(range(start, min(start + per_day, len(tasks))))
                for start in range(0, len(tasks), per_day)
            ]

    for day_offset, indexes in enumerate(days):
        for slot_index, task_index in enumerate(indexes):
            task = tasks[task_index]
            task.scheduled_for = today + timedelta(days=day_offset)
            task.slot = _SLOTS[slot_index % len(_SLOTS)]


def build_plan(
    request: PlanRequest,
    today: date,
    plan_id: str | None = None,
) -> StudyPlan:
    """Build the canonical StudyPlan. Pure: no I/O, clock injected via today."""
    plan_id = plan_id or f"plan-{uuid.uuid4().hex[:8]}"
    goal = extract_goal(request.input)
    count = _GRANULARITY_TASK_COUNT[request.granularity]
    topic = goal

    tasks: list[StudyTask] = []
    previous_id: str | None = None
    for i, (title_tpl, minutes, difficulty) in enumerate(_TASK_TEMPLATES[:count]):
        task_id = f"{plan_id}-t{i + 1:02d}"
        title = title_tpl.format(topic=topic)
        deck_request = (
            DeckRequest(requested=True, topic=topic)
            if i == _DECK_REQUEST_TEMPLATE_INDEX
            else None
        )
        tasks.append(
            StudyTask(
                id=task_id,
                title=title,
                description=f"{title}. One small, finishable step.",
                estimate_minutes=minutes,
                difficulty=difficulty,
                status="todo",
                scheduled_for=None,  # assigned by _schedule below
                slot=None,
                depends_on=[previous_id] if previous_id else [],
                deck_request=deck_request,
                world_label=f"{title} · {minutes} min",
            )
        )
        previous_id = task_id

    _schedule(
        tasks,
        today,
        request.deadline,
        request.hours_per_day or DEFAULT_HOURS_PER_DAY,
    )
    return StudyPlan(
        id=plan_id,
        goal=goal,
        empathy_line=_empathy_line(goal),
        granularity=request.granularity,
        tasks=tasks,
    )
