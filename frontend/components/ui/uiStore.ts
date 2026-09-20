"use client";

/**
 * uiStore.ts — the UI kit's shared state (Agent L zone; components/ui only).
 *
 * Presentation state for the NON-3D chrome: narration transcript, tour offer,
 * banners, task sheet, and the latest world-state snapshot the bus delivered.
 * The 3D world's own presentation state lives in T's worldStore
 * (components/world/worldStore.ts) — the two never duplicate a concept:
 * labelsVisible/lampGlow/worldMode are T's; transcript/tour/banners are here.
 */

import { create } from "zustand";
import type { WorldState } from "@/lib/types";

export type TranscriptLine = {
  id: string; // event id for narrator lines, local uuid for user lines
  who: "user" | "narrator";
  text: string;
};

export type UiStore = {
  transcript: TranscriptLine[];
  /** A pending tour offer (§1: non-blocking, never forced). */
  tourOfferId: string | null;
  /** The most recent roadmap seen (drives the always-visible "?" replay). */
  lastRoadmapId: string | null;
  /** A tour is currently playing (between tour_start and tour_end). */
  tourActive: boolean;
  /** Soft-amber error banner message (still unmistakably an error, §2.5). */
  errorMessage: string | null;
  /** SSE transport state — drives the "harbour mist" indicator (§7.2). */
  offline: boolean;
  worldState: WorldState | null;
  /** Whether the worldBus is feeding events (ChatPanel dedupes acks on it). */
  busConnected: boolean;
  taskSheetOpen: boolean;
  /** FR-4.3 journal view (the lamp's "Journal" pill). */
  journalOpen: boolean;

  addTranscript: (line: TranscriptLine) => void;
  setTourOffer: (roadmapId: string | null) => void;
  setTourStarted: (roadmapId: string) => void;
  setTourEnded: () => void;
  setError: (message: string | null) => void;
  setOffline: (offline: boolean) => void;
  setWorldState: (state: WorldState) => void;
  setBusConnected: (connected: boolean) => void;
  setTaskSheetOpen: (open: boolean) => void;
  setJournalOpen: (open: boolean) => void;
};

export const useUiStore = create<UiStore>((set) => ({
  transcript: [],
  tourOfferId: null,
  lastRoadmapId: null,
  tourActive: false,
  errorMessage: null,
  offline: false,
  worldState: null,
  busConnected: false,
  taskSheetOpen: false,
  journalOpen: false,

  addTranscript: (line) =>
    set((s) =>
      // Idempotent: an event id is never appended twice (§5.3 handlers).
      s.transcript.some((l) => l.id === line.id)
        ? s
        : { transcript: [...s.transcript, line] },
    ),
  setTourOffer: (roadmapId) =>
    set((s) => ({
      tourOfferId: roadmapId,
      lastRoadmapId: roadmapId ?? s.lastRoadmapId,
    })),
  setTourStarted: (roadmapId) =>
    set({ tourActive: true, tourOfferId: null, lastRoadmapId: roadmapId }),
  setTourEnded: () => set({ tourActive: false, tourOfferId: null }),
  setError: (message) => set({ errorMessage: message }),
  setOffline: (offline) => set({ offline }),
  setWorldState: (state) =>
    set((s) => ({
      worldState: state,
      // A rebuilt projection reconciles tour UI too (§4.2).
      tourOfferId: state.pendingTour?.roadmapId ?? s.tourOfferId,
      lastRoadmapId: state.pendingTour?.roadmapId ?? s.lastRoadmapId,
    })),
  setBusConnected: (connected) => set({ busConnected: connected }),
  setTaskSheetOpen: (open) => set({ taskSheetOpen: open }),
  setJournalOpen: (open) => set({ journalOpen: open }),
}));
