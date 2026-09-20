"use client";

/**
 * ChromeButton.tsx — THE one shared chrome button (calm cream chrome
 * language, session 023). Every DOM-chrome button in the app uses this —
 * one path (AGENTS.md §3).
 *
 * Look: opaque cream surface, navy ink text, radius 10, teal-tinted button
 * shadow, border 0, 600 13px system-ui. Hover = scale(1.05) over 80 ms and
 * nothing else (inline styles have no :hover, so hover is JS state).
 * `dimmed` (toggle-off) → opacity .55. `accent` recolors the surface; text
 * is white except on pale sand (ink). Disabled → opacity .6, no hover scale.
 * Icons are emoji only.
 */

import { useState, type ButtonHTMLAttributes } from "react";
import { CHROME, PALETTE } from "@/lib/theme";

export type ChromeAccent = "sky" | "sage" | "cornflower" | "mauve" | "sand";

const ACCENTS: Record<ChromeAccent, { background: string; color: string }> = {
  sky: { background: PALETTE.skyAction.hex, color: "#FFFFFF" },
  sage: { background: PALETTE.sageAction.hex, color: "#FFFFFF" },
  cornflower: { background: PALETTE.cornflower.hex, color: "#FFFFFF" },
  mauve: { background: PALETTE.mauve.hex, color: "#FFFFFF" },
  sand: { background: PALETTE.paleSand.hex, color: PALETTE.chromeInk.hex },
};

export type ChromeButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Toggle-off state: opacity .55. */
  dimmed?: boolean;
  /** Accent surface color; default is cream with ink text. */
  accent?: ChromeAccent;
};

export default function ChromeButton({
  dimmed = false,
  accent,
  disabled = false,
  style,
  children,
  onMouseEnter,
  onMouseLeave,
  ...rest
}: ChromeButtonProps) {
  const [hover, setHover] = useState(false);
  const colors = accent
    ? ACCENTS[accent]
    : { background: PALETTE.chromeCream.hex, color: PALETTE.chromeInk.hex };

  return (
    <button
      type="button"
      disabled={disabled}
      onMouseEnter={(e) => {
        setHover(true);
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        setHover(false);
        onMouseLeave?.(e);
      }}
      style={{
        background: colors.background,
        color: colors.color,
        border: 0,
        borderRadius: CHROME.radiusButton,
        boxShadow: CHROME.shadowButton,
        font: CHROME.font,
        padding: "8px 14px",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : dimmed ? 0.55 : 1,
        transform: hover && !disabled ? `scale(${CHROME.hoverScale})` : "none",
        transition: `transform ${CHROME.hoverMs}ms`,
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
