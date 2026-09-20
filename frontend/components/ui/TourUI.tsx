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

import { CHROME, PALETTE } from "@/lib/theme";
import ChromeButton from "./ChromeButton";
import { dismissTour, replayTour, startTour } from "./actions";
import { useUiStore } from "./uiStore";

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
              background: PALETTE.chromeCream.hex,
              color: PALETTE.chromeInk.hex,
              boxShadow: CHROME.shadowCard,
            }}
          >
            <span>Would you like a short harbour tour?</span>
            <ChromeButton onClick={() => void startTour(tourOfferId)}>
              Begin tour
            </ChromeButton>
            <ChromeButton dimmed onClick={() => void dismissTour(tourOfferId)}>
              Not now
            </ChromeButton>
          </div>
        </div>
      )}

      {/* §7.4: Skip is visible during any automated camera movement. */}
      {tourActive && lastRoadmapId && (
        <div className="fixed bottom-7 right-6 z-40">
          <ChromeButton onClick={() => void dismissTour(lastRoadmapId)}>
            Skip tour
          </ChromeButton>
        </div>
      )}

      {/* FR-5.3: the "?" replays the most recent tour, always available.
          Top-left — the top-right corner belongs to ViewPanel (one path). */}
      {lastRoadmapId && !tourActive && (
        <div className="fixed left-3 top-3 z-40">
          <ChromeButton
            aria-label="Replay the harbour tour"
            title="Replay the harbour tour"
            style={{ borderRadius: CHROME.radiusPill, padding: "8px 14px", fontWeight: 700 }}
            onClick={() => void replayTour(lastRoadmapId)}
          >
            ?
          </ChromeButton>
        </div>
      )}
    </>
  );
}
