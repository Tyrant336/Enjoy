"use client";

/**
 * TourUI.tsx — tour chrome (FR-5.3, §1: tours are OFFERED, never forced).
 *
 * - Offer: a quiet, non-blocking pill — [Begin tour] starts it,
 *   [Not now] dismisses (POST /api/tours/{id}/start|dismiss).
 * - "?": always-visible replay (POST /api/tours/{id}/replay with the most
 *   recent roadmap) — FR-5.3's replay entry.
 * - "Skip tour": visible for the whole tour (§7.4 — during ANY automated
 *   camera movement); Skip uses the dismiss endpoint, which emits tour_end
 *   (documented deviation, handoff §4.1 — one endpoint for both intents).
 *
 * Driven by uiStore (fed by the worldBus listeners / world-state rebuilds).
 */

import { LABEL } from "@/lib/theme";
import { dismissTour, replayTour, startTour } from "./actions";
import { useUiStore } from "./uiStore";

const pill: React.CSSProperties = {
  background: LABEL.fill,
  color: LABEL.text,
  boxShadow: LABEL.shadow,
  border: "none",
  borderRadius: 999,
  padding: "8px 16px",
  fontSize: 13,
  fontWeight: 550,
  cursor: "pointer",
};

export default function TourUI() {
  const tourOfferId = useUiStore((s) => s.tourOfferId);
  const tourActive = useUiStore((s) => s.tourActive);
  const lastRoadmapId = useUiStore((s) => s.lastRoadmapId);

  return (
    <>
      {/* §1: the offer is quiet and never blocks the world. */}
      {tourOfferId && !tourActive && (
        <div className="fixed bottom-7 left-1/2 z-40 -translate-x-1/2">
          <div
            className="flex items-center gap-2.5 rounded-full px-4 py-2 text-sm"
            style={{
              background: LABEL.fill,
              color: LABEL.text,
              boxShadow: LABEL.shadow,
            }}
          >
            <span>Would you like a short harbour tour?</span>
            <button
              type="button"
              style={{ ...pill, padding: "4px 12px" }}
              onClick={() => void startTour(tourOfferId)}
            >
              Begin tour
            </button>
            <button
              type="button"
              style={{ ...pill, padding: "4px 12px", opacity: 0.7 }}
              onClick={() => void dismissTour(tourOfferId)}
            >
              Not now
            </button>
          </div>
        </div>
      )}

      {/* §7.4: Skip is visible during any automated camera movement. */}
      {tourActive && lastRoadmapId && (
        <div className="fixed bottom-7 right-6 z-40">
          <button
            type="button"
            style={pill}
            onClick={() => void dismissTour(lastRoadmapId)}
          >
            Skip tour
          </button>
        </div>
      )}

      {/* FR-5.3: the "?" replays the most recent tour, always available. */}
      {lastRoadmapId && !tourActive && (
        <div className="fixed right-6 top-4 z-40">
          <button
            type="button"
            aria-label="Replay the harbour tour"
            title="Replay the harbour tour"
            className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold"
            style={{
              background: LABEL.fill,
              color: LABEL.text,
              boxShadow: LABEL.shadow,
              border: "none",
              cursor: "pointer",
            }}
            onClick={() => void replayTour(lastRoadmapId)}
          >
            ?
          </button>
        </div>
      )}
    </>
  );
}
