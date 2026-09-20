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
 * All chrome follows the calm cream chrome language (lib/theme.ts CHROME).
 */

import { PALETTE } from "@/lib/theme";
import ChromeButton from "@/components/ui/ChromeButton";
import { useWorldStore } from "./worldStore";

/** Notice pill → subtitle style: dark teal chip, pale text, fades in. */
const noticeStyle: React.CSSProperties = {
  background: "rgba(29,58,66,.73)",
  color: PALETTE.subtitleText.hex,
  border: 0,
  borderRadius: 999,
  padding: "8px 18px",
  font: "500 15px system-ui, sans-serif",
  pointerEvents: "none",
  animation: "chrome-notice-in 350ms",
};

export default function WorldOverlays() {
  const notice = useWorldStore((s) => s.notice);
  const reviewing = useWorldStore((s) => s.reviewing);
  const onExitReview = useWorldStore((s) => s.hostHandlers.onExitReview);
  const exitReview = useWorldStore((s) => s.exitReview);

  return (
    <>
      <style>{`@keyframes chrome-notice-in{from{opacity:0}to{opacity:1}}`}</style>
      {/* Gentle notice (warm copy only — never pressure, FR-2.6/AGENTS §7). */}
      {notice && (
        <div style={{ position: "absolute", bottom: 64, left: "50%", transform: "translateX(-50%)", zIndex: 32, pointerEvents: "none" }}>
          <div style={noticeStyle}>{notice}</div>
        </div>
      )}

      {/* FR-2.5.6: "Return to harbour" is always visible during review. */}
      {reviewing && (
        <div style={{ position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)", zIndex: 32 }}>
          <ChromeButton
            accent="sand"
            onClick={() => (onExitReview ? onExitReview() : exitReview())}
          >
            ← Return to harbour (Esc)
          </ChromeButton>
        </div>
      )}
    </>
  );
}
