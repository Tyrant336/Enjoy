"use client";

/**
 * DiveOverlay.tsx — the teal veil of the dive transition (REQUIREMENTS §4.3.2:
 * "camera descends toward water, teal overlay fades in, ≥1.5 s, eased").
 *
 * Visible (fading in) exactly while worldMode === "diving" — covering both the
 * descent AND the Layer A → Layer B swap, in both directions. Fades back out
 * when the destination mode arrives, revealing the atlas (dive) or the
 * harbour (surface). Reduced motion: the fade is near-instant (§7.4).
 * Never intercepts input.
 */

import { MOTION, PALETTE } from "@/lib/theme";
import { useWorldStore } from "./worldStore";

export default function DiveOverlay() {
  const worldMode = useWorldStore((s) => s.worldMode);
  const reducedMotion = useWorldStore((s) => s.reducedMotion);
  const diving = worldMode === "diving";
  const ms = reducedMotion ? 150 : MOTION.diveMs;

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 25,
        pointerEvents: "none",
        opacity: diving ? 1 : 0,
        transition: `opacity ${ms}ms ${MOTION.ease}`,
        background: `radial-gradient(ellipse at 50% 30%,
          ${PALETTE.abyssTop.hex} 0%,
          ${PALETTE.abyssMid.hex} 55%,
          ${PALETTE.abyssDeep.hex} 100%)`,
      }}
    />
  );
}
