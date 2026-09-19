/**
 * worldApi.ts — THE one T↔L interface (BUILDING.md §5.3): the 3D world
 * executes §5.3 WorldEvents through these methods. Signatures FROZEN at
 * Checkpoint 1 (Agent S); implementation by Agent T in Phase 2.
 *
 * Every method is:
 *  - idempotent (worldBus may replay events, REQUIREMENTS §4.2/§5.3),
 *  - reduced-motion aware (§7.4 — applied inside the store/CameraRig),
 *  - presentation-only (no business logic; grading/scheduling is Agent L's).
 *
 * `narrate` is deliberately absent: narration text is rendered by Agent L's
 * chat/transcript UI, not by the 3D world.
 */

import type {
  CameraPreset,
  Deck,
  Flashcard,
  Roadmap,
  WorldEvent,
} from "./types";
import {
  useWorldStore,
  type WorldCameraPreset,
} from "@/components/world/worldStore";

/** §5.3 `camera_fly_to` target — derived from the frozen contract. */
export type FlyTarget = Extract<
  WorldEvent,
  { type: "camera_fly_to" }
>["target"];

const store = () => useWorldStore.getState();

/** A duration below NFR-1's floor is a caller bug — fail loudly, don't clamp. */
function assertDuration(durationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs < 1500) {
    throw new Error(
      `worldApi.flyTo: durationMs must be ≥1500 (NFR-1), got ${durationMs}`,
    );
  }
}

/**
 * The real world API, executed against the live scene store.
 * Throwing = contract violation (unknown deck, bad duration) — loud by design.
 */
export const worldApi: WorldApi = {
  flyTo: (target, preset, durationMs) => {
    assertDuration(durationMs);
    if (preset === "underwater" || target === "underwater") {
      // §4.3.2: camera_fly_to underwater = the dive transition.
      store().dive();
      return;
    }
    // target "lamp" arrives with a generic preset — the world has a lamp pose.
    const p: WorldCameraPreset =
      target === "lamp" && preset !== "fleet" ? "lamp" : preset;
    store().requestCamera(p, durationMs);
  },

  highlight: (target) => {
    store().highlight(target);
  },

  spawnBoat: (deck) => {
    store().spawnBoat(deck); // keyed by deck.id — replays are no-ops
  },

  enterReviewPOV: (deckId) => {
    store().enterReview(deckId); // unknown deck → throws (loud)
  },

  showCard: (deckId, card) => {
    store().showCard(deckId, card); // question only; answer via REST reveal
  },

  sinkBoat: () => {
    store().sinkGradeBoat();
  },

  riseBoat: (card) => {
    store().riseBoat(card); // same card id → no-op
  },

  exitReviewPOV: () => {
    store().exitReview(); // not reviewing → no-op
  },

  dockAtLamp: (deckId) => {
    store().dockAtLamp(deckId); // already docked/docking → no-op
  },

  setLampGlow: (level) => {
    store().setLampGlow(level); // absolute level — naturally idempotent
  },

  offerTour: (roadmapId) => {
    store().offerTour(roadmapId);
  },

  startTour: (roadmap) => {
    store().startTour(roadmap); // same roadmap already playing → no-op
  },

  endTour: () => {
    store().endTour();
  },

  showError: (message) => {
    // Soft amber, still unmistakably an error (AGENTS.md §2.5). The world
    // surfaces it as a banner; it never pretends all is well.
    store().setWorldError(message);
  },
};

export interface WorldApi {
  /** §5.3 `camera_fly_to` — glide the camera (durationMs ≥1500; reduced-motion makes it a gentle cut). */
  flyTo(target: FlyTarget, preset: CameraPreset, durationMs: number): void;
  /** §5.3 `highlight` — label focus + gentle highlight on a world object. */
  highlight(target: string): void;
  /** §5.3 `spawn_boat` — a new deck's small boat joins the world. */
  spawnBoat(deck: Deck): void;
  /** §5.3 `enter_review_pov` — camera glides into first-person boat POV. */
  enterReviewPOV(deckId: string): void;
  /** §5.3 `show_card` — question pill only; the answer arrives via REST reveal. */
  showCard(deckId: string, card: Flashcard): void;
  /** §5.3 `sink_boat` — the clicked grade boat sinks gently (700–1200 ms). */
  sinkBoat(): void;
  /** §5.3 `rise_boat` — the next card's boat rises with a soft splash/ripple. */
  riseBoat(card: Flashcard): void;
  /** §5.3 `exit_review_pov` — leave review POV ("Return to harbour"). */
  exitReviewPOV(): void;
  /** §5.3 `dock_at_lamp` — completed deck's boat sails to the lamp and docks. */
  dockAtLamp(deckId: string): void;
  /** §5.3 `lamp_glow` — lamp emissive level, 0..1 (capped, subtle). */
  setLampGlow(level: number): void;
  /** §5.3 `tour_offer` — non-blocking "Begin tour? / Not now" prompt. */
  offerTour(roadmapId: string): void;
  /** §5.3 `tour_start` — begin the guided camera tour (skippable). */
  startTour(roadmap: Roadmap): void;
  /** §5.3 `tour_end` — tour finished (or skipped); camera returns to overview. */
  endTour(): void;
  /** §5.3 `error` — soft amber, still unmistakably an error (AGENTS.md §2.5). */
  showError(message: string): void;
}
