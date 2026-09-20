"use client";

/**
 * HintLine.tsx — the quiet bottom-left control hint (calm cream chrome
 * language, session 023). Purely informational: no pointer events, never
 * interactive.
 */

export default function HintLine() {
  return (
    <div
      style={{
        position: "fixed",
        left: 12,
        bottom: 10,
        zIndex: 30,
        font: "12px/1.4 system-ui, sans-serif",
        color: "rgba(238,245,244,.8)",
        textShadow: "0 1px 2px rgba(29,58,66,.47)",
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      click a boat: review · L: labels · drag to orbit · Esc: back
    </div>
  );
}
