"use client";

/**
 * WorldOverlays.tsx — DOM chrome that belongs to the 3D world (not Agent L's
 * UI panels): the gentle notice pill (warm copy, e.g. FR-2.5.8 nothing-due),
 * the soft-amber world error banner (AGENTS.md §2.5 — explicit, never
 * silent), the "Skip tour" control (§7.4 — visible during ANY automated
 * camera movement), the "Return to harbour" control (FR-2.5.6 — always
 * visible in review), and the tour-offer prompt (§1 — never forced).
 *
 * All pills follow docs/LABELS.md styling; comfort motion per NFR-1.
 */

import { LABEL, MOTION, PALETTE } from "@/lib/theme";
import { useWorldStore } from "./worldStore";

const pill: React.CSSProperties = {
  background: LABEL.fill,
  color: LABEL.text,
  boxShadow: LABEL.shadow,
  border: "none",
  borderRadius: 999,
  padding: "8px 16px",
  fontSize: 13,
  fontWeight: 550,
  fontFamily: "ui-rounded, system-ui, sans-serif",
  cursor: "pointer",
  transition: `opacity 400ms ${MOTION.ease}`,
};

export default function WorldOverlays() {
  const notice = useWorldStore((s) => s.notice);
  const worldError = useWorldStore((s) => s.worldError);
  const setWorldError = useWorldStore((s) => s.setWorldError);
  const tour = useWorldStore((s) => s.tour);
  const endTour = useWorldStore((s) => s.endTour);
  const tourOfferId = useWorldStore((s) => s.tourOfferId);
  const reviewing = useWorldStore((s) => s.reviewing);
  const onExitReview = useWorldStore((s) => s.hostHandlers.onExitReview);
  const onAcceptTour = useWorldStore((s) => s.hostHandlers.onAcceptTour);
  const onDismissTour = useWorldStore((s) => s.hostHandlers.onDismissTour);
  const exitReview = useWorldStore((s) => s.exitReview);
  const currentStep = tour ? tour.roadmap.steps[tour.stepIndex] : null;

  return (
    <>
      {/* Soft-amber world error — explicit, dismissable, never silent. */}
      {worldError && (
        <div role="alert" style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 32 }}>
          <div
            style={{
              ...pill,
              border: `2px solid ${PALETTE.softAmber.hex}`,
              cursor: "default",
              display: "flex",
              gap: 12,
              alignItems: "center",
            }}
          >
            <span>{worldError}</span>
            <button type="button" style={{ ...pill, padding: "2px 10px" }} onClick={() => setWorldError(null)}>
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Gentle notice (warm copy only — never pressure, FR-2.6/AGENTS §7). */}
      {notice && (
        <div style={{ position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)", zIndex: 32, pointerEvents: "none" }}>
          <div style={{ ...pill, cursor: "default" }}>{notice}</div>
        </div>
      )}

      {/* Tour offer (§1: quiet, non-blocking, never forced). */}
      {tourOfferId && !tour && (
        <div style={{ position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)", zIndex: 32 }}>
          <div style={{ ...pill, display: "flex", gap: 10, alignItems: "center", cursor: "default" }}>
            <span>Would you like a short harbour tour?</span>
            <button type="button" style={{ ...pill, padding: "4px 12px" }} onClick={() => onAcceptTour?.(tourOfferId)}>
              Begin tour
            </button>
            <button type="button" style={{ ...pill, padding: "4px 12px", opacity: 0.7 }} onClick={() => onDismissTour?.(tourOfferId)}>
              Not now
            </button>
          </div>
        </div>
      )}

      {/* Tour narration + Skip (§7.4: Skip is visible during any automated move). */}
      {tour && currentStep && (
        <div style={{ position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)", zIndex: 32, display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ ...pill, cursor: "default", maxWidth: 420, whiteSpace: "normal", textAlign: "center" }}>
            {currentStep.narration}
          </div>
          <button type="button" style={pill} onClick={endTour}>
            Skip tour
          </button>
        </div>
      )}

      {/* FR-2.5.6: "Return to harbour" is always visible during review. */}
      {reviewing && (
        <div style={{ position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)", zIndex: 32 }}>
          <button
            type="button"
            style={pill}
            onClick={() => (onExitReview ? onExitReview() : exitReview())}
          >
            ← Return to harbour (Esc)
          </button>
        </div>
      )}
    </>
  );
}
