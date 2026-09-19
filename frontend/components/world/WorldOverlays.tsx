"use client";

/**
 * WorldOverlays.tsx — DOM chrome that belongs to the 3D world (not Agent L's
 * UI panels): the gentle notice pill (warm copy, e.g. FR-2.5.8 nothing-due)
 * and the "Return to harbour" control (FR-2.5.6 — always visible in review).
 *
 * OWNED ELSEWHERE (one path, §3 — do not re-add here):
 *  - tour-offer prompt + "Skip tour" → Agent L's TourUI (uiStore),
 *  - error banners → Agent L's Banners (uiStore.errorMessage, fed by worldBus
 *    onError). The world store's worldError/tourOfferId remain the world's
 *    projection slots (worldApi writes them; the lab sandbox surfaces them).
 * The tour CAMERA runner stays in CameraRig; tourLabelTarget (FR-L3.2) stays
 * in the store and lights the toured object's pill.
 *
 * All pills follow docs/LABELS.md styling; comfort motion per NFR-1.
 */

import { LABEL, MOTION } from "@/lib/theme";
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
  const reviewing = useWorldStore((s) => s.reviewing);
  const onExitReview = useWorldStore((s) => s.hostHandlers.onExitReview);
  const exitReview = useWorldStore((s) => s.exitReview);

  return (
    <>
      {/* Gentle notice (warm copy only — never pressure, FR-2.6/AGENTS §7). */}
      {notice && (
        <div style={{ position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)", zIndex: 32, pointerEvents: "none" }}>
          <div style={{ ...pill, cursor: "default" }}>{notice}</div>
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
