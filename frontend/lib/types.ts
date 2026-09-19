/**
 * Canonical contracts — TypeScript mirror of `Backend/app/schemas.py`
 * (REQUIREMENTS v2.1 §5.1 + §5.2 + §5.3 WorldEvent union), transcribed verbatim.
 *
 * This file (mirrored from the BE Pydantic schemas) is the FROZEN contract.
 * No additions, no "improvements". Changes go through the monitor only
 * (BUILDING.md §5.2). Single source of truth: the BE file.
 */

// ── StudyPlan — Scheduler output (FR-1) ──────────────────────────────────────

export type TaskStatus = "todo" | "doing" | "done";

export type DeckRequest = {
  requested: boolean;
  topic: string;
};

export type StudyTask = {
  id: string;
  title: string; // verb-first
  description: string;
  estimateMinutes: number; // ≤ 45
  difficulty: number; // 1-5
  status: TaskStatus;
  scheduledFor: string | null; // local date, e.g. "2026-09-20"
  slot: string | null;
  dependsOn: string[];
  deckRequest: DeckRequest | null;
  worldLabel: string | null;
};

export type StudyPlan = {
  id: string;
  goal: string;
  empathyLine: string;
  granularity: number; // spice level 1-5
  tasks: StudyTask[];
};

// ── Deck + Flashcard (FR-2) ──────────────────────────────────────────────────

export type BoatState = "circle" | "docked" | "reviewing";

export type Deck = {
  id: string;
  name: string;
  boatState: BoatState;
  cardCount: number;
  dueToday: number;
  apkgUrl: string | null;
};

export type FsrsState = {
  state: string; // e.g. "new"
  stability: number | null;
  difficulty: number | null;
  intervalDays: number | null;
  reps: number;
};

export type Flashcard = {
  id: string;
  deckId: string;
  question: string;
  answer: string;
  due: string; // ISO datetime
  fsrsState: FsrsState;
};

// ── Knowledge graph (FR-3) — canonical API shape; FE adapts to atlas (§4.3) ──

export type KGNodeType = "Concept" | "Term" | "Formula" | "Process" | "Example";
export type KGEdgeType =
  | "EXPLAINS"
  | "PART_OF"
  | "REQUIRES"
  | "CONTRASTS_WITH"
  | "EXAMPLE_OF";

export type KGNode = {
  id: string;
  label: string;
  type: KGNodeType;
  clusterId: string;
  gloss: string;
  deckIds: string[];
  taskIds: string[];
};

export type KGLink = {
  source: string;
  target: string;
  type: KGEdgeType;
};

export type KnowledgeGraph = {
  nodes: KGNode[];
  links: KGLink[];
};

// ── Record (FR-4) ────────────────────────────────────────────────────────────

export type RecordKind = "deck_completed" | "task_done";

export type Record = {
  id: string;
  kind: RecordKind;
  refId: string;
  title: string;
  at: string; // ISO datetime
};

// ── Roadmap (FR-5.3) ─────────────────────────────────────────────────────────

export type CameraPreset =
  | "overview"
  | "fishboat"
  | "fleet"
  | "underwater"
  | "review";

export type RoadmapStep = {
  target: string; // "fishboat|smallboat:deck-thermo-1|underwater|lamp"
  narration: string; // ≤2 warm sentences
  cameraPreset: CameraPreset;
};

export type Roadmap = {
  id: string;
  planId: string;
  steps: RoadmapStep[];
};

// ── WorldState (§5.2 — canonical; the Zustand projection is rebuilt from it) ─

export type WorldUser = {
  timezone: string;
  labelsVisible: boolean;
  reducedMotion: boolean;
};

export type ReviewingState = {
  deckId: string;
  currentCard: Flashcard | null;
  answerRevealed: boolean;
};

export type GraphSummary = {
  nodeCount: number;
  edgeCount: number;
  updatedAt: string | null;
};

export type PendingTour = {
  roadmapId: string;
  roadmap: Roadmap;
};

export type WorldState = {
  user: WorldUser;
  activePlan: StudyPlan | null;
  decks: Deck[]; // includes boatState + dueToday
  reviewing: ReviewingState | null;
  records: Record[];
  graphSummary: GraphSummary;
  lampGlowLevel: number; // 0..1
  pendingTour: PendingTour | null;
  lastEventSeq: number; // per-user; for SSE gap detection
};

// ── API error envelope (§5.2 — all 4xx/5xx from OUR code) ────────────────────

export type ErrorEnvelope = {
  code: string;
  message: string;
  // `globalThis.Record` = TS built-in (our contract's `Record` model shadows it).
  detail: globalThis.Record<string, unknown> | null;
  recoverable: boolean;
};

// ── WorldEvent protocol (§5.3 — SSE `data:` payloads, exact set, no others) ──

export type WorldEvent = { id: string; seq: number } & (
  | { type: "narrate"; text: string }
  | {
      type: "camera_fly_to";
      target: "fishboat" | "fleet" | "lamp" | "underwater" | `smallboat:${string}`;
      preset: CameraPreset;
      durationMs: number; // ≥1500
    }
  | { type: "highlight"; target: string }
  | { type: "spawn_boat"; deck: Deck }
  | { type: "enter_review_pov"; deckId: string }
  | { type: "show_card"; deckId: string; card: Flashcard } // question only; answer via REST reveal
  | { type: "sink_boat" }
  | { type: "rise_boat"; card: Flashcard }
  | { type: "exit_review_pov" }
  | { type: "dock_at_lamp"; deckId: string }
  | { type: "lamp_glow"; level: number } // 0..1
  | { type: "tour_offer"; roadmapId: string } // "Begin tour?" prompt
  | { type: "tour_start"; roadmap: Roadmap }
  | { type: "tour_end" }
  | { type: "error"; message: string } // soft amber, still explicit
);
