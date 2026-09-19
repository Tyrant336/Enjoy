"""Canonical contracts — REQUIREMENTS v2.1 §5.1 + §5.2, transcribed verbatim.

This file (mirrored by `frontend/lib/types.ts`) is the FROZEN contract.
No additions, no "improvements". Changes go through the monitor only
(BUILDING.md §5.2). Field names serialize as camelCase to match the JSON
contract exactly.
"""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class ContractModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


# ── StudyPlan — Scheduler output (FR-1) ──────────────────────────────────────

TaskStatus = Literal["todo", "doing", "done"]


class DeckRequest(ContractModel):
    requested: bool
    topic: str


class StudyTask(ContractModel):
    id: str
    title: str  # verb-first
    description: str
    estimate_minutes: int  # ≤ 45
    difficulty: int  # 1-5
    status: TaskStatus
    scheduled_for: date | None  # local date
    slot: str | None
    depends_on: list[str]
    deck_request: DeckRequest | None
    world_label: str | None


class StudyPlan(ContractModel):
    id: str
    goal: str
    empathy_line: str
    granularity: int  # spice level 1-5
    tasks: list[StudyTask]


# ── Deck + Flashcard (FR-2) ──────────────────────────────────────────────────

BoatState = Literal["circle", "docked", "reviewing"]


class Deck(ContractModel):
    id: str
    name: str
    boat_state: BoatState
    card_count: int
    due_today: int
    apkg_url: str | None


class FsrsState(ContractModel):
    state: str  # e.g. "new"
    stability: float | None
    difficulty: float | None
    interval_days: float | None
    reps: int


class Flashcard(ContractModel):
    id: str
    deck_id: str
    question: str
    answer: str
    due: datetime
    fsrs_state: FsrsState


# ── Knowledge graph (FR-3) — canonical API shape; FE adapts to atlas (§4.3) ──

KGNodeType = Literal["Concept", "Term", "Formula", "Process", "Example"]
KGEdgeType = Literal["EXPLAINS", "PART_OF", "REQUIRES", "CONTRASTS_WITH", "EXAMPLE_OF"]


class KGNode(ContractModel):
    id: str
    label: str
    type: KGNodeType
    cluster_id: str
    gloss: str
    deck_ids: list[str]
    task_ids: list[str]


class KGLink(ContractModel):
    source: str
    target: str
    type: KGEdgeType


class KnowledgeGraph(ContractModel):
    nodes: list[KGNode]
    links: list[KGLink]


# ── Record (FR-4) ────────────────────────────────────────────────────────────

RecordKind = Literal["deck_completed", "task_done"]


class Record(ContractModel):
    id: str
    kind: RecordKind
    ref_id: str
    title: str
    at: datetime


# ── Roadmap (FR-5.3) ─────────────────────────────────────────────────────────

CameraPreset = Literal["overview", "fishboat", "fleet", "underwater", "review"]


class RoadmapStep(ContractModel):
    target: str  # "fishboat|smallboat:deck-thermo-1|underwater|lamp"
    narration: str  # ≤2 warm sentences
    camera_preset: CameraPreset


class Roadmap(ContractModel):
    id: str
    plan_id: str
    steps: list[RoadmapStep]


# ── WorldState (§5.2 — canonical; the Zustand projection is rebuilt from it) ─


class WorldUser(ContractModel):
    timezone: str
    labels_visible: bool
    reduced_motion: bool


class ReviewingState(ContractModel):
    deck_id: str
    current_card: Flashcard | None
    answer_revealed: bool


class GraphSummary(ContractModel):
    node_count: int
    edge_count: int
    updated_at: datetime | None


class PendingTour(ContractModel):
    roadmap_id: str
    roadmap: Roadmap


class WorldState(ContractModel):
    user: WorldUser
    active_plan: StudyPlan | None
    decks: list[Deck]  # includes boatState + dueToday
    reviewing: ReviewingState | None
    records: list[Record]
    graph_summary: GraphSummary
    lamp_glow_level: float  # 0..1
    pending_tour: PendingTour | None
    last_event_seq: int  # per-user; for SSE gap detection


# ── API error envelope (§5.2 — all 4xx/5xx from OUR code) ────────────────────


class ErrorEnvelope(ContractModel):
    code: str
    message: str
    detail: dict[str, object] | None = None
    recoverable: bool
