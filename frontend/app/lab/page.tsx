"use client";

/**
 * app/lab/page.tsx — Agent T's scratch sandbox (deleted before demo).
 * Phase 2: full review loop with a local mock 3-card "Thermo 1" deck
 * (test data lives in lab/ ONLY, never in production components), driven
 * through the REAL worldApi methods (the same calls Agent L's worldBus will
 * make from SSE events). Plus: §2.6 camera anchors, label toggle, lamp glow,
 * dive/surface, tour demo, and idempotency probes (every method fired twice).
 */

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { LABEL, MOTION, PALETTE } from "@/lib/theme";
import {
  useWorldStore,
  type WorldCameraPreset,
} from "@/components/world/worldStore";
import { worldApi } from "@/lib/worldApi";
import type { Deck, Flashcard, Roadmap } from "@/lib/types";
import DiveOverlay from "@/components/world/DiveOverlay";
import AtlasLayer from "@/components/underwater/AtlasLayer";

const HarbourCanvas = dynamic(() => import("@/components/world/HarbourCanvas"), {
  ssr: false,
});

/* ── Lab fixture (mirrors §4.6 seed; Flashcard-shaped, frozen types) ─────── */

const LAB_DECKS: Deck[] = [
  { id: "deck-thermo-1", name: "Thermo 1", boatState: "circle", cardCount: 3, dueToday: 3, apkgUrl: null },
  { id: "deck-thermo-2", name: "Thermo 2", boatState: "circle", cardCount: 12, dueToday: 5, apkgUrl: null },
  { id: "deck-thermo-3", name: "Thermo 3", boatState: "circle", cardCount: 8, dueToday: 2, apkgUrl: null },
  { id: "deck-thermo-basics", name: "Thermo Basics", boatState: "docked", cardCount: 24, dueToday: 0, apkgUrl: null },
];

const fsrs = { state: "new", stability: null, difficulty: null, intervalDays: null, reps: 0 };

/** §4.6: the due "Thermo 1" deck — exactly 3 cards (drives the review E2E). */
const THERMO1_CARDS: Flashcard[] = [
  { id: "card-01", deckId: "deck-thermo-1", question: "What does the 1st law of thermodynamics state?", answer: "Energy cannot be created or destroyed, only transformed.", due: "2026-09-19T18:00:00+08:00", fsrsState: fsrs },
  { id: "card-02", deckId: "deck-thermo-1", question: "What is entropy?", answer: "A measure of a system's microscopic disorder.", due: "2026-09-19T18:00:00+08:00", fsrsState: fsrs },
  { id: "card-03", deckId: "deck-thermo-1", question: "State the 2nd law of thermodynamics.", answer: "Entropy of an isolated system never decreases.", due: "2026-09-19T18:00:00+08:00", fsrsState: fsrs },
];

const DEMO_ROADMAP: Roadmap = {
  id: "road-01",
  planId: "plan-seed-01",
  steps: [
    { target: "fishboat", narration: "This is your fishboat — big scary tasks become small, finishable steps here.", cameraPreset: "fishboat" },
    { target: "fleet", narration: "The little boats are your flashcard decks. The ones circling are waiting for you today.", cameraPreset: "fleet" },
    { target: "underwater", narration: "Below the surface your knowledge grows into an atlas — dive in anytime.", cameraPreset: "underwater" },
    { target: "lamp", narration: "And the lamp keeps every small victory you have ever won. It only ever grows warmer.", cameraPreset: "overview" },
  ],
};

const PRESETS: WorldCameraPreset[] = ["overview", "topdown", "fishboat", "fleet", "lamp"];

const pillBtn: React.CSSProperties = {
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
  transition: `opacity 300ms ${MOTION.ease}, transform 300ms ${MOTION.ease}`,
};

export default function LabPage() {
  const worldMode = useWorldStore((s) => s.worldMode);
  const reviewing = useWorldStore((s) => s.reviewing);
  const labelsVisible = useWorldStore((s) => s.labelsVisible);
  const toggleLabels = useWorldStore((s) => s.toggleLabels);
  const lampGlow = useWorldStore((s) => s.lampGlow);
  const reducedMotion = useWorldStore((s) => s.reducedMotion);
  const setReducedMotion = useWorldStore((s) => s.setReducedMotion);
  const requestCamera = useWorldStore((s) => s.requestCamera);
  const dive = useWorldStore((s) => s.dive);
  const tourOfferId = useWorldStore((s) => s.tourOfferId);
  const worldError = useWorldStore((s) => s.worldError);
  const setWorldError = useWorldStore((s) => s.setWorldError);
  const tour = useWorldStore((s) => s.tour);

  // Seed the fleet through the real worldApi (idempotent — safe under
  // StrictMode double effects) and register the lab's mock host handlers.
  useEffect(() => {
    for (const d of LAB_DECKS) worldApi.spawnBoat(d);

    let reviewIdx = 0;
    const store = () => useWorldStore.getState();

    useWorldStore.getState().setHostHandlers({
      onOpenDeck: (deckId) => {
        if (deckId !== "deck-thermo-1") {
          // FR-2.5.8: nothing due — boats stay docked, gentle message.
          store().setNotice("Nothing is waiting for you right now. Your harbour can rest.");
          return;
        }
        reviewIdx = 0;
        worldApi.enterReviewPOV(deckId);
        worldApi.showCard(deckId, THERMO1_CARDS[0]);
      },
      onOpenToday: () => {
        store().setNotice("Agent L's task sheet docks at the 'today' anchor here.");
      },
      onReveal: () => {
        // Mock REST reveal latency (production: L's POST /review/reveal).
        setTimeout(() => store().revealAnswer(), 350);
      },
      onGrade: () => {
        // Mock: grade persists (250 ms), then sink → rise / completion (§5.3 order).
        setTimeout(() => worldApi.sinkBoat(), 250);
        setTimeout(() => {
          reviewIdx += 1;
          const next = THERMO1_CARDS[reviewIdx];
          if (next) {
            worldApi.riseBoat(next);
          } else {
            // FR-2.6: final card → dock at lamp + glow + warm words.
            worldApi.exitReviewPOV();
            worldApi.dockAtLamp("deck-thermo-1");
            worldApi.setLampGlow(Math.min(1, useWorldStore.getState().lampGlow + 0.15));
            store().setNotice("You did it — 'Thermo 1' rests at the lamp now. Today's sea is calm.");
          }
        }, 1150);
      },
      onExitReview: () => {
        worldApi.exitReviewPOV();
        store().setNotice("Progress is kept — 'Thermo 1' waits for you.");
      },
    });
  }, []);

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

  const busy = worldMode !== "harbour" || reviewing != null;

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", background: PALETTE.abyssDeep.hex }}>
      <HarbourCanvas />
      <AtlasLayer />
      <DiveOverlay />

      {/* Lab scratch surfaces for state whose product chrome lives in L's
          TourUI/Banners (one path, §3) — sandbox only, deleted with the lab. */}
      {worldError && (
        <div style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 33 }}>
          <div style={{ ...pillBtn, border: `2px solid ${PALETTE.softAmber.hex}`, cursor: "default", display: "flex", gap: 12, alignItems: "center" }}>
            <span>{worldError}</span>
            <button type="button" style={{ ...pillBtn, padding: "2px 10px" }} onClick={() => setWorldError(null)}>
              ✕
            </button>
          </div>
        </div>
      )}
      {tourOfferId && !tour && (
        <div style={{ position: "absolute", bottom: 76, left: "50%", transform: "translateX(-50%)", zIndex: 33 }}>
          <div style={{ ...pillBtn, display: "flex", gap: 10, alignItems: "center", cursor: "default" }}>
            <span>Would you like a short harbour tour?</span>
            <button type="button" style={{ ...pillBtn, padding: "4px 12px" }} onClick={() => worldApi.startTour(DEMO_ROADMAP)}>
              Begin tour
            </button>
            <button type="button" style={{ ...pillBtn, padding: "4px 12px", opacity: 0.7 }} onClick={() => worldApi.endTour()}>
              Not now
            </button>
          </div>
        </div>
      )}
      {tour && (
        <div style={{ position: "absolute", bottom: 76, left: "50%", transform: "translateX(-50%)", zIndex: 33 }}>
          <button type="button" style={pillBtn} onClick={() => worldApi.endTour()}>
            Skip tour (lab)
          </button>
        </div>
      )}

      {/* Toggle control (LABELS.md FR-L1.2.1) — always visible. */}
      <div style={{ position: "absolute", top: 16, right: 16, display: "flex", gap: 8, zIndex: 30 }}>
        <button
          type="button"
          style={{ ...pillBtn, opacity: labelsVisible ? 1 : 0.55 }}
          onClick={toggleLabels}
          aria-pressed={labelsVisible}
          title="Toggle world labels (L)"
        >
          Labels
        </button>
      </div>

      {/* Lab controls — sandbox only, not product UI. */}
      <div
        style={{
          position: "absolute",
          left: 16,
          bottom: 16,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          zIndex: 30,
          background: "rgba(237, 237, 221, 0.88)",
          borderRadius: 12,
          padding: 12,
          boxShadow: LABEL.shadow,
          fontFamily: "system-ui, sans-serif",
          fontSize: 12,
          color: LABEL.text,
        }}
      >
        <div style={{ fontWeight: 700 }}>lab · camera (§2.6)</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxWidth: 300 }}>
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              style={{ ...pillBtn, padding: "4px 10px", fontSize: 12 }}
              onClick={() => requestCamera(p)}
              disabled={busy}
            >
              {p}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxWidth: 300 }}>
          <button
            type="button"
            style={{ ...pillBtn, padding: "6px 12px", fontSize: 12 }}
            onClick={dive}
            disabled={busy}
          >
            ↓ Dive to atlas
          </button>
          <button
            type="button"
            style={{ ...pillBtn, padding: "6px 12px", fontSize: 12 }}
            onClick={() => worldApi.offerTour("road-01")}
            disabled={busy}
          >
            ? Tour offer
          </button>
        </div>
        <IdempotencyProbes />
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          lamp glow {lampGlow.toFixed(2)}
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={lampGlow}
            onChange={(e) => worldApi.setLampGlow(Number(e.target.value))}
          />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={reducedMotion}
            onChange={(e) => setReducedMotion(e.target.checked)}
          />
          reduced motion
        </label>
      </div>
    </div>
  );
}

/** Idempotency probes: each worldApi method fired twice in a row must be a
 *  harmless replay (worldBus guarantees at-least-once delivery). */
function IdempotencyProbes() {
  const twice = (fn: () => void) => () => {
    fn();
    fn();
  };
  const lampGlow = useWorldStore((s) => s.lampGlow);
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxWidth: 300 }}>
      <span style={{ width: "100%", fontWeight: 700 }}>worldApi ×2 probes</span>
      <button type="button" style={{ ...pillBtn, padding: "4px 10px", fontSize: 11 }} onClick={twice(() => worldApi.highlight("fishboat"))}>
        highlight
      </button>
      <button type="button" style={{ ...pillBtn, padding: "4px 10px", fontSize: 11 }} onClick={twice(() => worldApi.spawnBoat(LAB_DECKS[0]))}>
        spawnBoat
      </button>
      <button type="button" style={{ ...pillBtn, padding: "4px 10px", fontSize: 11 }} onClick={twice(() => worldApi.dockAtLamp("deck-thermo-basics"))}>
        dockAtLamp
      </button>
      <button type="button" style={{ ...pillBtn, padding: "4px 10px", fontSize: 11 }} onClick={twice(() => worldApi.setLampGlow(Math.min(1, lampGlow + 0.1)))}>
        setLampGlow
      </button>
      <button type="button" style={{ ...pillBtn, padding: "4px 10px", fontSize: 11 }} onClick={twice(() => worldApi.flyTo("fleet", "fleet", 1800))}>
        flyTo
      </button>
      <button type="button" style={{ ...pillBtn, padding: "4px 10px", fontSize: 11 }} onClick={twice(() => worldApi.showError("Probe: the mist thickens (soft-amber error)."))}>
        showError
      </button>
    </div>
  );
}
