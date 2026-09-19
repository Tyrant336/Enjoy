# DISTILL — 01-scheduler-fishboat → `Backend/`

## Goal (REQUIREMENTS.md §FR-1)
Fishboat Scheduler Agent: emotional/vague input → empathy line → goblin.tools-style
nested subtask breakdown (spice level 1–5) → timetable sized to user info.

## What to extract (per repo)

### `langgraph-plan-and-execute/plan-and-execute.ipynb` — BRAIN (copy the pattern)
- Copy the 3-node graph: `planner → executor → replan`, conditional `should_end`.
- Copy the replanner trick: `Act = Union[Response, Plan]`.
- **Modify:** replace `Plan(steps: List[str])` with:

```python
class Subtask(BaseModel):
    id: str
    title: str            # verb-first, concrete ("Read ch.4 §2", not "study")
    est_minutes: int
    difficulty: int       # 1-5  (= goblin "spice level" = breakdown depth)
    depends_on: list[str] = []
    scheduled_slot: str | None = None   # "2026-09-20 14:00-15:30"

class StudyPlan(BaseModel):
    empathy_line: str     # warm 1-sentence ack of the student's fear
    goal: str
    subtasks: list[Subtask]
```
- Target: `Backend/app/agents/scheduler/graph.py` + `Backend/app/agents/scheduler/schemas.py`

### `obsidian-magic-tasks/` — PROMPT (steal, 1 file)
- Find the Magic ToDo prompt in `main.ts` (search for the system/user prompt strings).
- Adapt into `Backend/app/agents/scheduler/prompts.py`:
  - add `granularity` (1–5) parameter = "spice level"
  - add rule: subtasks must be ≤45 min, verb-first, obviously finishable
  - add empathy_line instruction (tone: goblin "Judge" — gentle, never judgmental)

### `study-revision-planner/` — TIMETABLE CORE (fork the algorithm, not the app)
- Take ONLY the scheduler logic (difficulty-scaled intervals, exam-date backwards
  planning, mark-done) — find its scheduler module + its tests.
- Ignore: Flask routes, HTML templates, dashboard.
- Target: `Backend/app/agents/scheduler/timetable.py` (pure function:
  `list[Subtask] + deadline + hours_per_day → scheduled StudyPlan`)
- Copy its unit tests → `Backend/tests/test_timetable.py`

### `babyagi/` — IDEAS ONLY
- Read `babyagi.py` task-creation + prioritization prompts. No code copied.

### `langgraph-supervisor/` — REFERENCE ONLY
- Used by the orchestrator (see 04); fishboat itself stays a single plan-execute graph.

### `clive/` — IDEAS ONLY
- Read `planning/planner.py` + `dag_scheduler.py` for dependency-DAG scheduling.

## Interface the scaffold MUST expose
```
POST /agents/scheduler/plan
  in:  { "input": "I'm afraid of revising thermodynamics",
         "granularity": 1-5 (default 3),
         "deadline": "YYYY-MM-DD" | null,
         "hours_per_day": float | null }
  out: StudyPlan JSON  (→ FE renders on fishboat "Today" label + labels)
```

## Dependencies to add
`langgraph`, `langchain-openai` (OpenRouter base_url), `pydantic`, `pytest`

## DO NOT take
- Any Flask/Streamlit/JS frontends, dashboards, auth, databases from these repos.
