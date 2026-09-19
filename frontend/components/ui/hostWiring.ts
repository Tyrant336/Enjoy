"use client";

/**
 * hostWiring.ts — registers the world's production `hostHandlers` (Agent L's
 * side of the T↔L seam). The 3D world never calls REST itself
 * (worldStore.ts header); it raises intent through these handlers and the
 * answers arrive as WorldEvents over the bus (or as a world-state refetch
 * when the bus is not connected).
 *
 * Registered once by UserBootstrap on mount.
 */

import { useWorldStore } from "@/components/world/worldStore";
import {
  dismissTour,
  exitReview,
  gradeCard,
  reportError,
  revealCard,
  startReview,
  startTour,
} from "./actions";
import { useUiStore } from "./uiStore";

export function registerHostHandlers(): void {
  useWorldStore.getState().setHostHandlers({
    /** Click/Enter on a deck boat's pill → open its review (FR-2.5). */
    onOpenDeck: (deckId) => {
      void startReview(deckId);
    },

    /** Click on the fishboat's "Today" pill → open the task sheet (FR-1.6). */
    onOpenToday: () => {
      useUiStore.getState().setTaskSheetOpen(true);
    },

    /** FR-2.5.3 — REST reveal is the boundary; the answer only shows on success. */
    onReveal: () => {
      const card = useWorldStore.getState().reviewing?.card;
      if (!card) {
        reportError(new Error("Reveal requested with no current card."));
        return;
      }
      void revealCard(card.id).then((res) => {
        if (res) useWorldStore.getState().revealAnswer();
      });
    },

    /** FR-2.5.5 — persist the grade; sink/rise visuals arrive via the bus. */
    onGrade: (rating) => {
      const card = useWorldStore.getState().reviewing?.card;
      if (!card) {
        reportError(new Error(`Grade "${rating}" clicked with no current card.`));
        return;
      }
      void gradeCard(card.id, rating);
    },

    /** FR-2.5.6 — "Return to harbour" / Esc. */
    onExitReview: () => {
      const deckId = useWorldStore.getState().reviewing?.deckId;
      if (!deckId) {
        reportError(new Error("Exit review requested outside a review."));
        return;
      }
      void exitReview(deckId);
    },

    /** §1 tour offer answers — the same REST actions TourUI's pills call. */
    onAcceptTour: (roadmapId) => {
      void startTour(roadmapId);
    },
    onDismissTour: (roadmapId) => {
      void dismissTour(roadmapId);
    },
  });
}
