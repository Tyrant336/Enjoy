"use client";

/**
 * LabelPill.tsx — the ivory world label (docs/LABELS.md, REQUIREMENTS §2.3.5,
 * the locked local visual spec): rounded cream pill, dark navy text, soft
 * shadow, screen-aligned, floating above its object.
 *
 * Toggle behaviour (FR-L2): soft fade + slight rise (0.4–0.6 s, eased);
 * when off, the pill is fully unmounted after the fade — no invisible click
 * targets, nothing re-layouts. The single `labelsVisible` boolean in
 * worldStore is the only source of truth (FR-L1.3).
 *
 * Exemptions (FR-L3):
 *  - `always` — review-mode question/grade tags are gameplay UI, visible
 *    regardless of the toggle.
 *  - tour — the toured object's pill shows while the narrator explains it.
 * `worldId` ("fishboat" | "lamp" | `smallboat:${deckId}`) ties the pill to
 * §5.3 highlight targets: a highlighted pill gets a gentle amber ring.
 */

import { useEffect, useState } from "react";
import { Html } from "@react-three/drei";
import { LABEL, MOTION, PALETTE } from "@/lib/theme";
import { useWorldStore } from "./worldStore";

type Props = {
  text: string;
  /** Pill hierarchy (the locked local visual spec): fishboat largest, lamp medium, decks small. */
  size?: "lg" | "md" | "sm";
  onClick?: () => void;
  /** World-object id for highlight/tour targeting. */
  worldId?: string;
  /** FR-L3.1: gameplay UI (review question/grade tags) — never toggled off. */
  always?: boolean;
};

const FONT_PX = { lg: 30, md: 20, sm: 13 } as const;

export default function LabelPill({ text, size = "md", onClick, worldId, always }: Props) {
  const labelsVisible = useWorldStore((s) => s.labelsVisible);
  const reducedMotion = useWorldStore((s) => s.reducedMotion);
  const highlighted = useWorldStore((s) => s.highlighted);
  const tourLabelTarget = useWorldStore((s) => s.tourLabelTarget);
  const visible = Boolean(always) || labelsVisible || (worldId != null && tourLabelTarget === worldId);
  const isHighlighted = worldId != null && highlighted === worldId;

  // mounted stays true through the fade-out so the transition can play,
  // then the pill leaves the render path entirely (FR-L2.2).
  const [mounted, setMounted] = useState(visible);
  const [shown, setShown] = useState(visible);

  useEffect(() => {
    // Two-phase fade (mount → rAF shown; shown=false → unmount after the
    // transition) is the point of this effect; the pill is external DOM
    // (drei Html), not render-output state.
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMounted(true);
      const t = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(t);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), reducedMotion ? 30 : 550);
    return () => clearTimeout(t);
  }, [visible, reducedMotion]);

  if (!mounted) return null;

  const px = FONT_PX[size];
  const fadeMs = reducedMotion ? 1 : 500; // FR-L2.1: ≈0.4–0.6 s

  return (
    <Html center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
      <div
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={
          onClick
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClick();
                }
              }
            : undefined
        }
        style={{
          pointerEvents: onClick ? "auto" : "none",
          background: LABEL.fill,
          color: LABEL.text,
          boxShadow: isHighlighted
            ? `0 0 0 3px ${PALETTE.softAmber.hex}, ${LABEL.shadow}`
            : LABEL.shadow,
          borderRadius: 999,
          padding: `${px * 0.35}px ${px * 0.75}px`,
          fontSize: px,
          fontWeight: size === "lg" ? 650 : 550,
          fontFamily:
            "ui-rounded, system-ui, -apple-system, 'Segoe UI', sans-serif",
          letterSpacing: "-0.01em",
          whiteSpace: "nowrap",
          userSelect: "none",
          opacity: shown ? 1 : 0,
          transform: shown
            ? isHighlighted
              ? "translateY(0) scale(1.07)"
              : "translateY(0)"
            : "translateY(6px)",
          transition: `opacity ${fadeMs}ms ${MOTION.ease}, transform ${fadeMs}ms ${MOTION.ease}, box-shadow ${fadeMs}ms ${MOTION.ease}`,
          cursor: onClick ? "pointer" : "default",
        }}
      >
        {text}
      </div>
    </Html>
  );
}
