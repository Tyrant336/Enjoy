"use client";

/**
 * worldStore.ts — the single Zustand store for the 3D world (Agent T zone).
 *
 * Owns ONLY presentation state for the world layers:
 *   worldMode     — "harbour" | "diving" | "underwater" (REQUIREMENTS §4.3.2)
 *   labelsVisible — master label toggle (docs/LABELS.md FR-L1; one boolean,
 *                   one place, persisted to localStorage per FR-L1.4)
 *   lampGlow      — 0..1 lamp emissive level (FR-4.4)
 *   reducedMotion — §7.4; seeded from prefers-reduced-motion, user-toggleable
 *   cameraRequest — requested camera preset + duration (consumed by CameraRig)
 *   boats         — small-boat fleet presentation state (deckId → BoatEntry),
 *                   written ONLY through worldApi (spawn/dock/review…)
 *   reviewing     — review-POV presentation state (FR-2.5)
 *   tour          — guided-tour runner state (FR-5.3; narration text itself is
 *                   rendered by Agent L's chat UI, not here)
 *   notice/worldError — gentle cream notice pill / soft-amber world error
 *   hostHandlers  — callbacks the HOST registers (lab mocks in Phase 2; Agent
 *                   L's worldBus/REST wiring in production). The world never
 *                   calls REST itself (no business logic here, AGENTS.md §3).
 *
 * Business/server state (decks, plans, records) is backend-owned
 * (REQUIREMENTS §4.2) — this store is a projection that executes WorldEvents.
 */

import { create } from "zustand";
import type { CameraPreset } from "@/lib/types";
import type { Deck, Flashcard, Roadmap, WorldState } from "@/lib/types";
import { MOTION } from "@/lib/theme";
import { SAIL_TINTS } from "./layout";

export type WorldMode = "harbour" | "diving" | "underwater";

/**
 * World camera presets = the frozen contract's CameraPreset PLUS "lamp" and
 * "topdown". The contract union (types.ts) intentionally omits both (a tour
 * reaches the lamp via target:"lamp"); the world layer needs them for the
 * §2.6 anchor perspectives, so it extends the union locally — types.ts
 * itself stays frozen.
 */
export type WorldCameraPreset = CameraPreset | "lamp" | "topdown";

/** FR-2.8 grade ratings (FSRS 1–4). "Again" is soft amber, never red. */
export type GradeRating = "again" | "hard" | "good" | "easy";
export const GRADE_ORDER: readonly GradeRating[] = ["again", "hard", "good", "easy"];

export type BoatStatus = "circle" | "docked" | "reviewing" | "docking";

export type BoatEntry = {
  deckId: string;
  name: string;
  sailTint: string;
  leader: boolean;
  status: BoatStatus;
  /** Canonical Deck.apkgUrl (FR-2.7 export) — the docked boat's Anki link. */
  apkgUrl: string | null;
  /** Stable fleet-slot index: drives the staggered pile offsets and the
   *  golden-angle wander phase (layout.ts pileSlot, Fleet.tsx). */
  pileIndex: number;
  /** Bumped on spawn/dock to retrigger entrance animations. */
  animNonce: number;
};

export type ReviewState = {
  deckId: string;
  card: Flashcard | null;
  answerRevealed: boolean;
  /** The grade boat the user last touched (click / key 1–4). */
  lastGrade: GradeRating | null;
  /** The grade boat currently sinking (FR-2.5.5), if any. */
  sinkingGrade: GradeRating | null;
  /** Bumped by riseBoat to replay the card-boat rise. */
  riseNonce: number;
};

export type HostHandlers = {
  /** User asked to open a deck boat (click/Enter on its pill). */
  onOpenDeck?: (deckId: string) => void;
  /** User clicked the fishboat's "Today" pill (FR-1.6: camera move is done
   *  by the world; the host opens the task sheet at the "today" anchor). */
  onOpenToday?: () => void;
  /** User asked to reveal the current card's answer (REST reveal is L's). */
  onReveal?: () => void;
  /** User picked a grade (click or keys 1–4). */
  onGrade?: (rating: GradeRating) => void;
  /** User asked to leave review ("Return to harbour" / Esc). */
  onExitReview?: () => void;
  /** User accepted the pending tour offer. */
  onAcceptTour?: (roadmapId: string) => void;
  /** User declined the pending tour offer ("Not now"). */
  onDismissTour?: (roadmapId: string) => void;
  /** The tour runner finished the LAST step naturally (FR-5.3) — the host
   *  clears the tour chrome (Skip tour) since no tour_end SSE event exists
   *  for natural completion. */
  onTourFinished?: () => void;
  /** Each tour step's narration (FR-5.5: narration is also readable text). */
  onTourNarrate?: (text: string) => void;
  /** User clicked the lamp's "Journal" pill (FR-4.3 journal view). */
  onOpenJournal?: () => void;
};

const LABELS_STORAGE_KEY = "harbour_labels_visible";

function readStoredLabelsVisible(): boolean {
  if (typeof window === "undefined") return true; // labels default ON (FR-L1.1)
  const raw = window.localStorage.getItem(LABELS_STORAGE_KEY);
  return raw === null ? true : raw === "1";
}

function readPrefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export type WorldStore = {
  worldMode: WorldMode;
  /** Where an in-flight "diving" transition is headed. */
  diveDestination: "underwater" | "harbour";
  labelsVisible: boolean;
  lampGlow: number; // 0..1, capped, subtle (FR-4.4)
  /** Bumped when lampGlow increases — LampBuoy plays a gentle pulse. */
  lampPulseNonce: number;
  reducedMotion: boolean;
  cameraRequest: { preset: WorldCameraPreset; nonce: number; durationMs: number };
  /** Flotilla freeze during review (session 032, owner ask): while a review
   *  owns the student's attention the whole flotilla holds its breath — the
   *  orbit clock pauses. `accum` = total paused seconds, `since` = the
   *  frame-clock time the current pause started (both in THREE.Clock
   *  seconds). Written ONLY by orbitNow (lazy, idempotent, two sets per
   *  review — transition frames only). */
  orbitPause: { accum: number; since: number | null };

  boats: Record<string, BoatEntry>;
  reviewing: ReviewState | null;
  /** §5.3 highlight target ("fishboat" | "lamp" | `smallboat:${id}` …). */
  highlighted: string | null;
  notice: string | null;
  worldError: string | null;
  tour: { roadmap: Roadmap; stepIndex: number } | null;
  tourOfferId: string | null;
  /** FR-L3.2: while the tour explains an object its label shows even if off. */
  tourLabelTarget: string | null;
  hostHandlers: HostHandlers;

  toggleLabels: () => void;
  setReducedMotion: (on: boolean) => void;
  requestCamera: (preset: WorldCameraPreset, durationMs?: number) => void;
  /** Begin the ≥1.5 s eased dive: camera descends, teal overlay fades in. */
  dive: () => void;
  /** Reverse: overlay covers, atlas unmounts, camera rises to overview. */
  surface: () => void;

  /* ── worldApi-facing actions (idempotent — worldBus may replay) ── */
  spawnBoat: (deck: Deck) => void;
  dockAtLamp: (deckId: string) => void;
  /** Called by the docking boat when its path animation completes. */
  finishDock: (deckId: string) => void;
  enterReview: (deckId: string) => void;
  showCard: (deckId: string, card: Flashcard) => void;
  revealAnswer: () => void;
  /** Sinks the last-touched grade boat (sink_boat carries no param, §5.3). */
  touchGrade: (rating: GradeRating) => void;
  sinkGradeBoat: () => void;
  riseBoat: (card: Flashcard) => void;
  exitReview: () => void;
  /** §5.2: absolute projection rebuild from the canonical server WorldState
   *  (worldBus bootstrap / gap-refetch). Idempotent by construction. */
  syncFromWorldState: (state: WorldState) => void;
  setLampGlow: (level: number) => void;
  highlight: (target: string) => void;
  setNotice: (text: string | null) => void;
  setWorldError: (message: string | null) => void;
  offerTour: (roadmapId: string) => void;
  startTour: (roadmap: Roadmap) => void;
  advanceTour: () => void;
  endTour: () => void;
  setHostHandlers: (h: HostHandlers) => void;
};

/** Deterministic sail tint from the deck id (approved tokens only, §2.4). */
const TINTS = [SAIL_TINTS.purple, SAIL_TINTS.sage, SAIL_TINTS.blueGrey];

function sailTintFor(deckId: string): string {
  let h = 5381;
  for (let i = 0; i < deckId.length; i++) h = ((h << 5) + h + deckId.charCodeAt(i)) | 0;
  return TINTS[Math.abs(h) % TINTS.length];
}

export const useWorldStore = create<WorldStore>((set, get) => {
  let diveTimer: ReturnType<typeof setTimeout> | null = null;
  let highlightTimer: ReturnType<typeof setTimeout> | null = null;
  let noticeTimer: ReturnType<typeof setTimeout> | null = null;

  const armDiveTimer = (destination: "underwater" | "harbour") => {
    if (diveTimer) clearTimeout(diveTimer);
    // Reduced motion (§7.4): the dive becomes a gentle quick fade, not a descent.
    const wait = get().reducedMotion ? 250 : MOTION.diveMs + 100;
    diveTimer = setTimeout(() => {
      diveTimer = null;
      set({ worldMode: destination });
      if (destination === "harbour") {
        get().requestCamera("overview");
      }
    }, wait);
  };

  return {
    worldMode: "harbour",
    diveDestination: "underwater",
    labelsVisible: readStoredLabelsVisible(),
    lampGlow: 0.35, // §4.6: seeded records give the lamp a gentle base glow
    lampPulseNonce: 0,
    reducedMotion: readPrefersReducedMotion(),
    cameraRequest: { preset: "overview", nonce: 0, durationMs: MOTION.cameraMs },
    orbitPause: { accum: 0, since: null },

    boats: {},
    reviewing: null,
    highlighted: null,
    notice: null,
    worldError: null,
    tour: null,
    tourOfferId: null,
    tourLabelTarget: null,
    hostHandlers: {},

    toggleLabels: () => {
      const next = !get().labelsVisible;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LABELS_STORAGE_KEY, next ? "1" : "0");
      }
      set({ labelsVisible: next });
    },

    setReducedMotion: (on) => set({ reducedMotion: on }),

    requestCamera: (preset, durationMs = MOTION.cameraMs) =>
      set((s) => ({ cameraRequest: { preset, nonce: s.cameraRequest.nonce + 1, durationMs } })),

    dive: () => {
      if (get().worldMode !== "harbour") return;
      set({ worldMode: "diving", diveDestination: "underwater" });
      armDiveTimer("underwater");
    },

    surface: () => {
      if (get().worldMode !== "underwater") return;
      set({ worldMode: "diving", diveDestination: "harbour" });
      armDiveTimer("harbour");
    },

    spawnBoat: (deck) => {
      const boats = get().boats;
      if (boats[deck.id]) return; // idempotent replay
      const circling = Object.values(boats).filter((b) => b.status === "circle");
      const entry: BoatEntry = {
        deckId: deck.id,
        name: deck.name,
        sailTint: sailTintFor(deck.id),
        // The first circling boat is the leader (§2.3.2: 1.15×, soft purple).
        leader: deck.boatState === "circle" && circling.length === 0,
        status: deck.boatState === "circle" ? "circle" : deck.boatState === "reviewing" ? "reviewing" : "docked",
        apkgUrl: deck.apkgUrl,
        pileIndex: Object.keys(boats).length,
        animNonce: 1,
      };
      if (entry.leader) entry.sailTint = SAIL_TINTS.purple;
      set({ boats: { ...boats, [deck.id]: entry } });
    },

    dockAtLamp: (deckId) => {
      const b = get().boats[deckId];
      if (!b) throw new Error(`dockAtLamp: unknown deck '${deckId}'`);
      if (b.status === "docked" || b.status === "docking") return; // idempotent
      // FR-2.6 completion: docking the deck under review ENDS the review.
      // §5.3's final grade sequence (sink_boat → dock_at_lamp → lamp_glow)
      // carries no exit_review_pov, so the world leaves the POV here — the
      // same reviewing:null path as exitReview (one path; CameraRig's
      // POV-exit branch owns the camera return).
      if (get().reviewing?.deckId === deckId) set({ reviewing: null });
      set({
        boats: { ...get().boats, [deckId]: { ...b, status: "docking", animNonce: b.animNonce + 1 } },
      });
    },

    finishDock: (deckId) => {
      const b = get().boats[deckId];
      if (!b || b.status !== "docking") return;
      set({ boats: { ...get().boats, [deckId]: { ...b, status: "docked" } } });
    },

    enterReview: (deckId) => {
      const b = get().boats[deckId];
      if (!b) throw new Error(`enterReview: unknown deck '${deckId}'`);
      const cur = get().reviewing;
      if (cur && cur.deckId === deckId) return; // idempotent replay
      set({
        boats: { ...get().boats, [deckId]: { ...b, status: "reviewing" } },
        reviewing: { deckId, card: null, answerRevealed: false, lastGrade: null, sinkingGrade: null, riseNonce: 0 },
      });
    },

    showCard: (deckId, card) => {
      const cur = get().reviewing;
      if (!cur || cur.deckId !== deckId) {
        // Tolerant for idempotent replays: reconstruct the review state.
        get().enterReview(deckId);
      }
      const now = get().reviewing!;
      if (now.card?.id === card.id && !now.answerRevealed) return; // idempotent
      set({
        reviewing: { ...now, card, answerRevealed: false, lastGrade: null, sinkingGrade: null, riseNonce: now.riseNonce + 1 },
      });
    },

    revealAnswer: () => {
      const cur = get().reviewing;
      if (!cur || !cur.card || cur.answerRevealed) return; // idempotent
      set({ reviewing: { ...cur, answerRevealed: true } });
    },

    touchGrade: (rating) => {
      const cur = get().reviewing;
      if (!cur) return;
      set({ reviewing: { ...cur, lastGrade: rating } });
    },

    sinkGradeBoat: () => {
      const cur = get().reviewing;
      if (!cur || !cur.card) return;
      if (cur.sinkingGrade) return; // already sinking (idempotent)
      // sink_boat carries no parameter (§5.3): the world sinks the grade boat
      // the user just touched. If none was touched (a replayed event after
      // state rebuild), there is nothing to sink — the row resets on the next
      // riseBoat anyway, so this is a guarded no-op, not hidden state loss.
      if (!cur.lastGrade) {
        console.warn("[world] sinkBoat: no grade boat was touched — nothing to sink");
        return;
      }
      set({ reviewing: { ...cur, sinkingGrade: cur.lastGrade } });
    },

    riseBoat: (card) => {
      const cur = get().reviewing;
      if (!cur) return;
      if (cur.card?.id === card.id) return; // idempotent replay
      set({
        reviewing: {
          ...cur,
          card,
          answerRevealed: false,
          lastGrade: null,
          sinkingGrade: null,
          riseNonce: cur.riseNonce + 1,
        },
      });
    },

    exitReview: () => {
      const cur = get().reviewing;
      if (!cur) return; // idempotent
      const b = get().boats[cur.deckId];
      const boats = b
        ? {
            ...get().boats,
            // FR-2.5.6: progress kept — the boat returns to the circle unless
            // it is already sailing to the lamp (completion path).
            [cur.deckId]: { ...b, status: b.status === "reviewing" ? "circle" : b.status },
          }
        : get().boats;
      set({ reviewing: null, boats });
      // Camera return is owned by CameraRig's POV-exit branch (it syncs
      // camera-controls to the POV pose first to avoid a snap).
    },

    syncFromWorldState: (state) => {
      // §5.2: the server WorldState is canonical. This rebuilds the world
      // projection ABSOLUTELY — same state in → same projection out, so
      // worldBus replays/refetches are harmless. Boundary validation is
      // strict (§2.4): malformed canonical state is a contract bug — throw.
      if (!state || !Array.isArray(state.decks)) {
        throw new Error("syncFromWorldState: state.decks must be an array");
      }
      const prev = get();

      const boats: Record<string, BoatEntry> = {};
      state.decks.forEach((deck, i) => {
        if (!deck.id || typeof deck.name !== "string") {
          throw new Error(`syncFromWorldState: malformed deck at index ${i}`);
        }
        const existing = prev.boats[deck.id];
        if (existing) {
          // Preserve local presentation memory (anim nonce, leader flag,
          // pile slot); canonical status + export URL are rebuilt.
          boats[deck.id] = {
            ...existing,
            status: deck.boatState,
            apkgUrl: deck.apkgUrl,
          };
          return;
        }
        const circlingSoFar = Object.values(boats).filter((b) => b.status === "circle");
        const entry: BoatEntry = {
          deckId: deck.id,
          name: deck.name,
          sailTint: sailTintFor(deck.id),
          leader: deck.boatState === "circle" && circlingSoFar.length === 0,
          status: deck.boatState,
          apkgUrl: deck.apkgUrl,
          pileIndex: i,
          animNonce: 1,
        };
        if (entry.leader) entry.sailTint = SAIL_TINTS.purple;
        boats[deck.id] = entry;
      });

      let reviewing: ReviewState | null = null;
      const r = state.reviewing;
      if (r) {
        if (!boats[r.deckId]) {
          throw new Error(
            `syncFromWorldState: reviewing deck '${r.deckId}' is not in decks`,
          );
        }
        const cur = prev.reviewing;
        const unchanged =
          cur &&
          cur.deckId === r.deckId &&
          (cur.card?.id ?? null) === (r.currentCard?.id ?? null) &&
          cur.answerRevealed === r.answerRevealed;
        reviewing = unchanged
          ? cur
          : {
              deckId: r.deckId,
              card: r.currentCard,
              answerRevealed: r.answerRevealed,
              lastGrade: null,
              sinkingGrade: null,
              riseNonce: (cur?.riseNonce ?? 0) + 1,
            };
      }

      const glow = Math.min(1, Math.max(0, state.lampGlowLevel));
      if (state.user.labelsVisible !== prev.labelsVisible && typeof window !== "undefined") {
        window.localStorage.setItem(LABELS_STORAGE_KEY, state.user.labelsVisible ? "1" : "0");
      }

      set({
        boats,
        reviewing,
        lampGlow: glow, // absolute level; a rebuild is not a victory pulse
        labelsVisible: state.user.labelsVisible,
        // §7.4: reduced motion is accessibility — sticky ON. The server value
        // can switch it on, but a server `false` never overrides an OS-level
        // `prefers-reduced-motion` (the store's seed) or a manual toggle-on.
        reducedMotion: state.user.reducedMotion || prev.reducedMotion,
        tourOfferId: state.pendingTour?.roadmapId ?? null,
      });
    },

    setLampGlow: (level) => {
      if (!Number.isFinite(level)) {
        throw new Error(`setLampGlow: level must be finite, got ${level}`);
      }
      const clamped = Math.min(1, Math.max(0, level));
      const prev = get().lampGlow;
      set((s) => ({
        lampGlow: clamped,
        lampPulseNonce: clamped > prev ? s.lampPulseNonce + 1 : s.lampPulseNonce,
      }));
    },

    highlight: (target) => {
      if (highlightTimer) clearTimeout(highlightTimer);
      set({ highlighted: target });
      highlightTimer = setTimeout(() => {
        highlightTimer = null;
        set({ highlighted: null });
      }, 2600);
    },

    setNotice: (text) => {
      if (noticeTimer) clearTimeout(noticeTimer);
      set({ notice: text });
      if (text) {
        noticeTimer = setTimeout(() => {
          noticeTimer = null;
          set({ notice: null });
        }, 6000);
      }
    },

    setWorldError: (message) => set({ worldError: message }),

    offerTour: (roadmapId) => {
      if (get().tourOfferId === roadmapId) return; // idempotent
      set({ tourOfferId: roadmapId });
    },

    startTour: (roadmap) => {
      const cur = get().tour;
      if (cur && cur.roadmap.id === roadmap.id) return; // idempotent replay
      set({ tour: { roadmap, stepIndex: 0 }, tourOfferId: null });
    },

    advanceTour: () => {
      const cur = get().tour;
      if (!cur) return;
      if (cur.stepIndex + 1 >= cur.roadmap.steps.length) {
        get().endTour();
        // Natural completion: no tour_end SSE event exists — the host clears
        // its tour chrome (Skip tour) through this intent (one path, seam).
        get().hostHandlers.onTourFinished?.();
        return;
      }
      set({ tour: { ...cur, stepIndex: cur.stepIndex + 1 } });
    },

    endTour: () => {
      if (!get().tour && !get().tourOfferId) return; // idempotent
      const wasDiving = get().worldMode !== "harbour";
      set({ tour: null, tourOfferId: null, tourLabelTarget: null });
      if (wasDiving) get().surface();
      else get().requestCamera("overview");
    },

    setHostHandlers: (h) => set({ hostHandlers: h }),
  };
});

/**
 * orbitNow — THE paused-aware orbit clock (session 032, owner ask: "the
 * boats that aren't needed should stop following while I solve flashcards").
 * Every `orbitState(...)` consumer (Fishboat / Fleet / CameraRig / Ocean)
 * maps the raw frame clock through this — one clock, one path. While a
 * review is active the flotilla freezes exactly where it is (the fishboat
 * included — freezing only the small boats would leave them chasing the tug
 * for minutes, and freezing the tug naively would teleport it on exit).
 * Pause/resume is derived lazily from `reviewing`, so EVERY review entry/exit
 * path (enterReview, exitReview, dock-under-review, state rebuilds) is
 * covered with zero wiring. Writes happen on transition frames only.
 */
export function orbitNow(t: number): number {
  const s = useWorldStore.getState();
  let { accum, since } = s.orbitPause;
  if (s.reviewing !== null && since === null) {
    since = t;
    useWorldStore.setState({ orbitPause: { accum, since } });
  } else if (s.reviewing === null && since !== null) {
    accum += t - since;
    since = null;
    useWorldStore.setState({ orbitPause: { accum, since } });
  }
  return since === null ? t - accum : since - accum;
}
