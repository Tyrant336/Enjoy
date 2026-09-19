"use client";

/**
 * actions.ts — the UI kit's REST actions. ONE path per action (AGENTS.md §3):
 * ChatPanel, TourUI, TaskSheet and the world hostHandlers all call these —
 * nothing else in the UI kit ever calls `harbourFetch` directly.
 *
 * Error policy (AGENTS.md §2): every action catches and surfaces the failure
 * in the soft-amber banner via `uiStore.errorMessage`, then returns null.
 * Nothing here throws, nothing here swallows — callers never need try/catch.
 *
 * Bus dedupe: when the worldBus is connected, WorldEvents (tour_start,
 * enter_review_pov, …) drive the stores; the actions only patch uiStore
 * locally when the bus is NOT connected, so an event and its REST ack never
 * double-apply.
 */

import type {
  Flashcard,
  Roadmap,
  StudyPlan,
  StudyTask,
  WorldState,
  Record as HarbourRecord,
} from "@/lib/types";
import { harbourFetch, HarbourApiError } from "./api";
import { useUiStore } from "./uiStore";

/* ── Response payloads (Backend endpoints; NOT part of the frozen §5.1
   contract — types.ts stays untouched. Parse by key, never position.) ── */

export type ChatResponse = {
  ack: string;
  route: string; // "direct_zone:<zone>" | "big_task" | "narrate"
  plan: StudyPlan | null;
  roadmapId: string | null;
};

export type DeckProgress = {
  deckId: string;
  total: number;
  graded: number;
  remaining: number;
  nextCard: Flashcard | null;
  completed: boolean;
};

export type ReviewStartResponse = {
  deckId: string;
  card: Flashcard | null; // null = nothing due (FR-2.5.8)
  progress: DeckProgress;
};

export type RevealResponse = { cardId: string; answer: string };

export type GradeResponse = { card: Flashcard; deckProgress: DeckProgress };

export type TaskCompleteResponse = { task: StudyTask; record: HarbourRecord };

/* ── shared helpers ─────────────────────────────────────────────────────── */

/** Surface any failure in the soft-amber banner (§2.5 — loud, never silent). */
export function reportError(err: unknown): void {
  const message =
    err instanceof HarbourApiError
      ? err.envelope.message
      : err instanceof Error
        ? err.message
        : String(err);
  useUiStore.getState().setError(message);
}

function post(body?: unknown): RequestInit {
  return { method: "POST", body: body === undefined ? "{}" : JSON.stringify(body) };
}

/** GET /api/world-state → uiStore (the rebuilt projection, §4.2). */
export async function refreshWorldState(): Promise<void> {
  try {
    const state = await harbourFetch<WorldState>("/api/world-state");
    useUiStore.getState().setWorldState(state);
  } catch (err) {
    reportError(err);
  }
}

/* ── chat (FR-5.1) ──────────────────────────────────────────────────────── */

export async function sendChat(message: string): Promise<ChatResponse | null> {
  try {
    return await harbourFetch<ChatResponse>("/api/chat", post({ message }));
  } catch (err) {
    reportError(err);
    return null;
  }
}

/* ── tours (§5.2 — offered, never forced) ───────────────────────────────── */

export async function startTour(roadmapId: string): Promise<void> {
  try {
    await harbourFetch<Roadmap>(
      `/api/tours/${encodeURIComponent(roadmapId)}/start`,
      post(),
    );
    if (!useUiStore.getState().busConnected) {
      useUiStore.getState().setTourStarted(roadmapId);
    }
  } catch (err) {
    reportError(err);
  }
}

export async function replayTour(roadmapId: string): Promise<void> {
  try {
    await harbourFetch<Roadmap>(
      `/api/tours/${encodeURIComponent(roadmapId)}/replay`,
      post(),
    );
    if (!useUiStore.getState().busConnected) {
      useUiStore.getState().setTourStarted(roadmapId);
    }
  } catch (err) {
    reportError(err);
  }
}

/** "Not now" AND "Skip tour" — one endpoint; dismiss emits tour_end (§5.2). */
export async function dismissTour(roadmapId: string): Promise<void> {
  try {
    await harbourFetch<{ roadmapId: string }>(
      `/api/tours/${encodeURIComponent(roadmapId)}/dismiss`,
      post(),
    );
    if (!useUiStore.getState().busConnected) {
      useUiStore.getState().setTourEnded();
    }
  } catch (err) {
    reportError(err);
  }
}

/* ── review (FR-2.5 — the world's hostHandlers call these) ──────────────── */

export async function startReview(
  deckId: string,
): Promise<ReviewStartResponse | null> {
  try {
    const res = await harbourFetch<ReviewStartResponse>(
      "/agents/flashcards/review/start",
      post({ deckId }),
    );
    if (!useUiStore.getState().busConnected) await refreshWorldState();
    return res;
  } catch (err) {
    reportError(err);
    return null;
  }
}

export async function revealCard(cardId: string): Promise<RevealResponse | null> {
  try {
    return await harbourFetch<RevealResponse>(
      "/agents/flashcards/review/reveal",
      post({ cardId }),
    );
  } catch (err) {
    reportError(err);
    return null;
  }
}

export async function gradeCard(
  cardId: string,
  rating: "again" | "hard" | "good" | "easy",
): Promise<GradeResponse | null> {
  try {
    const res = await harbourFetch<GradeResponse>(
      "/agents/flashcards/review/grade",
      post({ cardId, rating }),
    );
    if (!useUiStore.getState().busConnected) await refreshWorldState();
    return res;
  } catch (err) {
    reportError(err);
    return null;
  }
}

export async function exitReview(deckId: string): Promise<void> {
  try {
    await harbourFetch<{ deckId: string }>(
      "/agents/flashcards/review/exit",
      post({ deckId }),
    );
    if (!useUiStore.getState().busConnected) await refreshWorldState();
  } catch (err) {
    reportError(err);
  }
}

/* ── tasks (FR-1.6 "Done") ──────────────────────────────────────────────── */

export async function completeTask(taskId: string): Promise<void> {
  try {
    await harbourFetch<TaskCompleteResponse>(
      `/agents/scheduler/tasks/${encodeURIComponent(taskId)}/complete`,
      post(),
    );
    // FR-1.6.3: the sheet always re-reads the canonical projection (task
    // strike-through + lamp glow), bus or no bus.
    await refreshWorldState();
  } catch (err) {
    reportError(err);
  }
}
