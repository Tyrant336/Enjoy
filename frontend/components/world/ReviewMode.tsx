"use client";

/**
 * ReviewMode.tsx — the flashcard review POV (FR-2.5, EXACT flow):
 *   camera glides into first-person boat POV (CameraRig) → question pill above
 *   the card boat → "Reveal answer" fades the answer pill in beneath → 4 grade
 *   boats rise in a row (Again=soft amber, never red; all text-labelled, §7.4)
 *   → grade click sinks the clicked boat → next card's boat rises with a soft
 *   ripple (700–1200 ms, NFR-1) → final card → completion (dock + glow, via
 *   worldApi from the host) → "Return to harbour" / Esc always available.
 *
 * The world renders and animates ONLY; grading/scheduling/REST is the host's
 * (hostHandlers.onGrade / onReveal / onExitReview — lab mocks in Phase 2,
 * Agent L's wiring in production). Review pills are gameplay UI: always
 * visible regardless of the label toggle (FR-L3.1).
 * Reduced motion (§7.4): rise/sink become fades, no bobbing.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PALETTE } from "@/lib/theme";
import { readBoatRuntime } from "./boatRuntime";
import { useSmallBoatModel } from "./SmallBoat";
import { setGroupOpacity } from "./modelUtils";
import LabelPill from "./LabelPill";
import {
  GRADE_ORDER,
  useWorldStore,
  type GradeRating,
  type ReviewState,
} from "./worldStore";

const SINK_DEPTH = -2.4;
const RISE_FROM = -2.4;

/** Grade presentation: soft amber for "Again" (NEVER red), pastel row. */
const GRADE_STYLE: Record<GradeRating, { tint: string; label: string }> = {
  again: { tint: PALETTE.softAmber.hex, label: "Again" },
  hard: { tint: PALETTE.sailBlueGrey.hex, label: "Hard" },
  good: { tint: PALETTE.sailSage.hex, label: "Good" },
  easy: { tint: PALETTE.sailPurple.hex, label: "Easy" },
};

/** Frame-rate independent eased approach; τ tuned to settle in ≈0.9–1.1 s. */
function approach(current: number, target: number, dt: number): number {
  const k = 1 - Math.pow(0.004, dt);
  return current + (target - current) * k;
}

/** Soft ripple ring on the water when a card boat rises (FR-2.5.5). */
function RippleRing({ trigger }: { trigger: number }) {
  const mesh = useRef<THREE.Mesh>(null);
  const t0 = useRef<number | null>(null);
  const reducedMotion = useWorldStore((s) => s.reducedMotion);

  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    if (trigger > 0 && t0.current === null) t0.current = clock.elapsedTime;
    if (t0.current === null) return;
    const elapsed = clock.elapsedTime - t0.current;
    const dur = reducedMotion ? 0.4 : 1.0;
    const k = Math.min(1, elapsed / dur);
    const s = 0.4 + k * 2.8;
    m.scale.set(s, s, s);
    (m.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k);
    if (k >= 1) t0.current = null;
  });

  return (
    <mesh ref={mesh} rotation-x={-Math.PI / 2} position-y={0.02}>
      <ringGeometry args={[0.85, 1, 48]} />
      <meshBasicMaterial
        color={PALETTE.waterSheen.hex}
        transparent
        opacity={0}
        depthWrite={false}
      />
    </mesh>
  );
}

/** One grade boat (FR-2.5.4): rises post-reveal, sinks when its grade is picked. */
function GradeBoat({
  rating,
  index,
  answerRevealed,
  sinking,
  onGrade,
}: {
  rating: GradeRating;
  index: number;
  answerRevealed: boolean;
  sinking: boolean;
  onGrade: (rating: GradeRating) => void;
}) {
  const { model, reflection } = useSmallBoatModel(GRADE_STYLE[rating].tint);
  const reducedMotion = useWorldStore((s) => s.reducedMotion);
  const outer = useRef<THREE.Group>(null);
  const modelGroup = useRef<THREE.Group>(null);
  const y = useRef(RISE_FROM);
  const opacity = useRef(0);
  const [pillShown, setPillShown] = useState(false);

  // Whether the pill should be up: after reveal, while not sunk.
  const wantUp = answerRevealed && !sinking;
  useEffect(() => {
    if (wantUp) {
      // Stagger the row's rise slightly (comfort, NFR-1 local timing).
      const t = setTimeout(() => setPillShown(true), reducedMotion ? 0 : index * 90);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPillShown(false);
  }, [wantUp, index, reducedMotion]);

  useFrame(({ clock }, dt) => {
    const o = outer.current, mg = modelGroup.current;
    if (!o || !mg) return;
    const targetY = wantUp ? 0 : SINK_DEPTH;
    const targetO = wantUp ? 1 : 0;
    if (reducedMotion) {
      // §7.4: sink/rise become fades — no vertical travel.
      y.current = 0;
      opacity.current = approach(opacity.current, targetO, dt * 2);
    } else {
      y.current = approach(y.current, targetY, dt);
      opacity.current = approach(opacity.current, targetO, dt * 2);
    }
    mg.position.y = y.current + Math.sin(clock.elapsedTime * 0.8 + index * 1.9) * 0.04;
    mg.rotation.z = Math.sin(clock.elapsedTime * 0.6 + index) * 0.02;
    setGroupOpacity(mg, opacity.current);
    setGroupOpacity(reflection, opacity.current * 0.3);
  });

  return (
    <group ref={outer}>
      <group ref={modelGroup} scale={0.26} rotation-y={Math.PI} onClick={() => onGrade(rating)}>
        <primitive object={model} />
        <primitive object={reflection} />
      </group>
      {pillShown && (
        <group position={[0, 1.6, 0]}>
          <LabelPill
            text={`${index + 1} · ${GRADE_STYLE[rating].label}`}
            size="sm"
            always
            onClick={() => onGrade(rating)}
          />
        </group>
      )}
    </group>
  );
}

/** The card boat: carries the current question; rises with each new card. */
function CardBoat({ reviewing }: { reviewing: ReviewState }) {
  const { model, reflection } = useSmallBoatModel(PALETTE.sailSage.hex);
  const reducedMotion = useWorldStore((s) => s.reducedMotion);
  const revealAnswer = useWorldStore((s) => s.revealAnswer);
  const onReveal = useWorldStore((s) => s.hostHandlers.onReveal);
  const modelGroup = useRef<THREE.Group>(null);
  const y = useRef(RISE_FROM);
  const opacity = useRef(0);

  useFrame(({ clock }, dt) => {
    const mg = modelGroup.current;
    if (!mg) return;
    if (reducedMotion) {
      y.current = 0;
      opacity.current = approach(opacity.current, 1, dt * 2);
    } else {
      y.current = approach(y.current, 0, dt);
      opacity.current = approach(opacity.current, 1, dt * 2);
    }
    mg.position.y = y.current + Math.sin(clock.elapsedTime * 0.65 + 0.8) * 0.05;
    setGroupOpacity(mg, opacity.current);
    setGroupOpacity(reflection, opacity.current * 0.3);
  });

  // New card → restart the rise from below (FR-2.5.5 "out of nowhere").
  useEffect(() => {
    if (!reducedMotion) y.current = RISE_FROM;
    opacity.current = reducedMotion ? 0 : 0.35;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by design
  }, [reviewing.riseNonce]);

  if (!reviewing.card) return null;

  return (
    <group>
      <group ref={modelGroup} scale={0.3} rotation-y={Math.PI}>
        <primitive object={model} />
        <primitive object={reflection} />
      </group>
      <RippleRing trigger={reviewing.riseNonce} />

      {/* Question pill (FR-2.5.2) — always visible in review (FR-L3.1). */}
      <group position={[0, 3.1, 0]}>
        <LabelPill text={reviewing.card.question} size="md" always />
      </group>

      {/* Reveal (FR-2.5.3) or the answer pill fading in beneath. */}
      {!reviewing.answerRevealed ? (
        <group position={[0, 2.15, 0]}>
          <LabelPill
            text="Reveal answer"
            size="sm"
            always
            onClick={() => {
              if (onReveal) onReveal();
              else revealAnswer(); // no host yet — lab fallback is explicit
            }}
          />
        </group>
      ) : (
        <group position={[0, 2.0, 0]}>
          <LabelPill text={reviewing.card.answer} size="sm" always />
        </group>
      )}
    </group>
  );
}

export default function ReviewMode() {
  const reviewing = useWorldStore((s) => s.reviewing);
  const onGrade = useWorldStore((s) => s.hostHandlers.onGrade);
  const onExitReview = useWorldStore((s) => s.hostHandlers.onExitReview);
  const touchGrade = useWorldStore((s) => s.touchGrade);
  const setWorldError = useWorldStore((s) => s.setWorldError);
  const exitReview = useWorldStore((s) => s.exitReview);
  const group = useRef<THREE.Group>(null);

  const grade = (rating: GradeRating) => {
    if (!useWorldStore.getState().reviewing?.answerRevealed) return;
    touchGrade(rating);
    if (onGrade) onGrade(rating);
    else setWorldError("Review is not connected to the harbour yet — your grade was not recorded.");
  };
  const exit = () => {
    if (onExitReview) onExitReview();
    else exitReview();
  };

  // §7.4 keyboard parity: Esc = Return to harbour, 1–4 = grade boats.
  useEffect(() => {
    if (!reviewing) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Escape") {
        e.preventDefault();
        exit();
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= 4) grade(GRADE_ORDER[n - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers read live store
  }, [reviewing != null, onGrade != null, onExitReview != null]);

  useFrame(() => {
    const g = group.current;
    if (!g || !reviewing) return;
    const rt = readBoatRuntime(reviewing.deckId);
    g.position.copy(rt.pos);
    g.rotation.y = Math.atan2(rt.forward.x, rt.forward.z);
  });

  const cardLayout = useMemo(() => ({ cardDist: 7.5, rowDist: 4.2, lateral: [-3.4, -1.15, 1.15, 3.4] }), []);

  if (!reviewing) return null;

  return (
    <group ref={group}>
      {/* Card boat ahead of the player boat. */}
      <group position={[0, 0, cardLayout.cardDist]}>
        <CardBoat reviewing={reviewing} />
      </group>
      {/* Grade boats rise in a row between player and card boat. */}
      {GRADE_ORDER.map((rating, i) => (
        <group key={rating} position={[-cardLayout.lateral[i], 0, cardLayout.rowDist]}>
          <GradeBoat
            rating={rating}
            index={i}
            answerRevealed={reviewing.answerRevealed}
            sinking={reviewing.sinkingGrade === rating}
            onGrade={grade}
          />
        </group>
      ))}
    </group>
  );
}
