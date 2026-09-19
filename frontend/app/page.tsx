"use client";

/**
 * app/page.tsx — the production harbour (monitor-wired, Phase 3).
 *
 * Composition (one path, §3 — every piece has exactly one owner):
 *  - HarbourCanvas + AtlasLayer + DiveOverlay …… Agent T's 3D world (§4.3)
 *  - UserBootstrap ……………………………………… identity, host handlers,
 *    world-state, and the SSE WorldBus against the REAL worldApi
 *  - ChatPanel / TourUI / TaskSheet / Banners …… Agent L's product chrome
 *
 * The world's own chrome (notice pill, Return-to-harbour) stays inside
 * HarbourCanvas/WorldOverlays; tour offer/Skip/errors are L's components
 * only — never mounted twice.
 */

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { LABEL, MOTION, PALETTE } from "@/lib/theme";
import { worldApi } from "@/lib/worldApi";
import { useWorldStore } from "@/components/world/worldStore";
import DiveOverlay from "@/components/world/DiveOverlay";
import AtlasLayer from "@/components/underwater/AtlasLayer";
import UserBootstrap from "@/components/ui/UserBootstrap";
import ChatPanel from "@/components/ui/ChatPanel";
import TourUI from "@/components/ui/TourUI";
import TaskSheet from "@/components/ui/TaskSheet";
import Banners from "@/components/ui/Banners";

const HarbourCanvas = dynamic(() => import("@/components/world/HarbourCanvas"), {
  ssr: false,
});

export default function Home() {
  const labelsVisible = useWorldStore((s) => s.labelsVisible);
  const toggleLabels = useWorldStore((s) => s.toggleLabels);

  // FR-L1.2.2: `L` toggles labels — never while typing in an input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "l" || e.key === "L") toggleLabels();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleLabels]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        background: PALETTE.abyssDeep.hex,
      }}
    >
      <UserBootstrap worldApi={worldApi} />

      <HarbourCanvas />
      <AtlasLayer />
      <DiveOverlay />

      {/* Product chrome (Agent L) — single instances, one path each. */}
      <ChatPanel />
      <TourUI />
      <TaskSheet />
      <Banners />

      {/* Label master toggle (LABELS.md FR-L1.2.1) — always visible. */}
      <div
        style={{
          position: "absolute",
          top: 16,
          right: 76, // clear of TourUI's "?" replay pill at right:16
          zIndex: 30,
        }}
      >
        <button
          type="button"
          onClick={toggleLabels}
          aria-pressed={labelsVisible}
          title="Toggle world labels (L)"
          style={{
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
            opacity: labelsVisible ? 1 : 0.55,
            transition: `opacity 300ms ${MOTION.ease}`,
          }}
        >
          Labels
        </button>
      </div>
    </div>
  );
}
