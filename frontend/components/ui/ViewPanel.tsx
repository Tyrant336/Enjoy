"use client";

/**
 * ViewPanel.tsx — the top-right view controls (calm cream chrome language,
 * session 023). One column of ChromeButtons, one path per action:
 *
 *  - 🎣 Today / 💡 Lamp / 🌍 Global … camera presets (worldStore.requestCamera).
 *    Hidden while reviewing — the review POV owns the camera (FR-2.5).
 *  - 🌊 Atlas / ↑ Surface … dive()/surface(). Disabled mid-transition
 *    ("diving") and during review (the store guards dive/surface by mode;
 *    a mode change mid-review would fight the review POV).
 *  - 🏷 Labels … toggleLabels() (FR-L1.2.1), dimmed when labels are off.
 *  - 🐢 Calm motion … setReducedMotion() (§7.4), dimmed when full motion.
 *
 * Both toggles also persist via PUT /api/preferences (§5.2); a failed call
 * keeps the local state AND shows the soft-amber banner (never silent).
 */

import { useWorldStore } from "@/components/world/worldStore";
import { updatePreferences } from "./actions";
import ChromeButton from "./ChromeButton";

export default function ViewPanel() {
  const worldMode = useWorldStore((s) => s.worldMode);
  const reviewing = useWorldStore((s) => s.reviewing);
  const labelsVisible = useWorldStore((s) => s.labelsVisible);
  const reducedMotion = useWorldStore((s) => s.reducedMotion);
  const requestCamera = useWorldStore((s) => s.requestCamera);
  const dive = useWorldStore((s) => s.dive);
  const surface = useWorldStore((s) => s.surface);
  const toggleLabels = useWorldStore((s) => s.toggleLabels);
  const setReducedMotion = useWorldStore((s) => s.setReducedMotion);

  const isReviewing = reviewing != null;

  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        zIndex: 30,
      }}
    >
      {!isReviewing && (
        <>
          <ChromeButton onClick={() => requestCamera("fishboat")}>🎣 Today</ChromeButton>
          <ChromeButton onClick={() => requestCamera("lamp")}>💡 Lamp</ChromeButton>
          <ChromeButton onClick={() => requestCamera("topdown")}>🌍 Global</ChromeButton>
        </>
      )}
      {worldMode === "diving" ? (
        <ChromeButton disabled>🌊 Atlas</ChromeButton>
      ) : worldMode === "underwater" ? (
        <ChromeButton disabled={isReviewing} onClick={surface}>
          ↑ Surface
        </ChromeButton>
      ) : (
        <ChromeButton disabled={isReviewing} onClick={dive}>
          🌊 Atlas
        </ChromeButton>
      )}
      <ChromeButton
        dimmed={!labelsVisible}
        aria-pressed={labelsVisible}
        title="Toggle world labels (L)"
        onClick={() => {
          toggleLabels();
          // Persist (§5.2); failure → banner, local state holds (never silent).
          void updatePreferences({
            labelsVisible: useWorldStore.getState().labelsVisible,
          });
        }}
      >
        🏷 Labels
      </ChromeButton>
      <ChromeButton
        dimmed={!reducedMotion}
        aria-pressed={reducedMotion}
        title="Reduced motion — camera cuts instead of fly-throughs (§7.4)"
        onClick={() => {
          setReducedMotion(!reducedMotion);
          void updatePreferences({
            reducedMotion: useWorldStore.getState().reducedMotion,
          });
        }}
      >
        🐢 Calm motion
      </ChromeButton>
    </div>
  );
}
