"use client";

/**
 * Fleet.tsx — the small-boat fleet (FR-2.4, §2.3.2), driven by worldStore
 * (which is written only through worldApi). Statuses (§2.5):
 *   circle    — due decks follow the fishboat in a staggered pile astern
 *               (today's queue); the whole flotilla orbits the lamp
 *   reviewing — the opened deck PEELS OUT of the ring to open water
 *               (radially away from the lamp, eased ≥1500 ms — the visible
 *               selection, session 032), shows a SelectionRing halo, then
 *               holds its outpost (the POV tracks it live in CameraRig)
 *   docking   — completed deck sails an eased path to its lamp slot (FR-2.6)
 *   docked    — rests moored at the lamp ring (does NOT orbit) with a warm
 *               low glow
 * Motion (bright-day fleet feel): afloat boats chase their pile slot in the
 * orbiting flotilla frame bow-first (the GLB bow is +z — verified against
 * the hull bounds: z −1.78…+2.29 vs x ±0.89), with golden-angle heading
 * wander, turn-rate-capped yaw (arcs, never snaps), distance-scaled speed,
 * and CPU swell bob from the shared wave table (swell.ts — same constants as
 * the GPU water normals). Reduced motion (§7.4): the dock path becomes an
 * instant cut; bobbing and wander are skipped.
 *
 * Live per-frame transforms go to boatRuntime (not the store) — CameraRig,
 * ReviewMode and the dock path read from there.
 */

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { LABEL, PALETTE } from "@/lib/theme";
import { harbourBaseUrl } from "@/components/ui/api";
import { LAMP_POS, SMALLBOAT_LENGTH, dockSlotPos, orbitState, pileSlot } from "./layout";
import { useSmallBoatModel } from "./SmallBoat";
import { dropBoatRuntime, writeBoatRuntime } from "./boatRuntime";
import { swellHeight } from "./swell";
import LabelPill from "./LabelPill";
import SelectionRing from "./SelectionRing";
import { orbitNow, useWorldStore, type BoatEntry } from "./worldStore";

const DOCK_MS = 2200;
/** Peel-out (review entry): eased sail-out of the ring — same calm 2.2 s
 *  feel as the dock path (NFR-1 ≥1500 ms). 24 u radially outward clears the
 *  pile and keeps the orbiting tug from looming through the review scene. */
const PEEL_MS = 2200;
const PEEL_DISTANCE = 24;
/** Turn cap (rad/s): boats arc, never snap. */
const TURN_RATE = 1.2;
/** Bow-first speed window (u/s): distance-scaled, never stalled, capped.
 *  The cap must clear the ring's tangential speed (ω·R ≈ 8.1 u/s at R=180,
 *  layout.ts FLEET_CIRCLE) or the pile would lag astern forever. */
const MIN_SPEED = 2.2;
const MAX_SPEED = 11.0;

function wrapToPi(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function FleetBoat({ entry, dockIndex }: { entry: BoatEntry; dockIndex: number }) {
  // All small boats are ONE size (owner decision session 032 — the 1.15×
  // leader scale is gone; the leader keeps only its soft purple sail).
  const length = SMALLBOAT_LENGTH;
  const model = useSmallBoatModel(entry.sailTint, length);
  const reducedMotion = useWorldStore((s) => s.reducedMotion);
  const finishDock = useWorldStore((s) => s.finishDock);
  const onOpenDeck = useWorldStore((s) => s.hostHandlers.onOpenDeck);

  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  // Bow-first yaw (smoothed, turn-rate capped). Live waterline pose (the dock
  // capture and the review freeze read it, exact).
  const yaw = useRef(0);
  const pos = useRef(new THREE.Vector3());
  const initialized = useRef(false);
  // Dock path state: captured when status flips to "docking".
  const dockT = useRef<number | null>(null);
  const dockFrom = useRef(new THREE.Vector3());
  const dockAngleFrom = useRef(0);
  // Peel-out state: captured when status flips to "reviewing".
  const peelT = useRef<number | null>(null);
  const peelFrom = useRef(new THREE.Vector3());
  const peelTo = useRef(new THREE.Vector3());

  // Staggered pile slot (deterministic) + golden-angle wander phase.
  const pile = pileSlot(entry.pileIndex);
  const phase = entry.pileIndex * 2.399;

  const status = entry.status;

  // Capture the dock start pose exactly once per docking run.
  useEffect(() => {
    if (status === "docking" && dockT.current === null) {
      dockT.current = 0;
      dockFrom.current.copy(pos.current);
      dockAngleFrom.current = yaw.current;
    }
    if (status !== "docking") dockT.current = null;
  }, [status]);

  // Capture the peel-out exactly once per review entry: radially OUT of the
  // flotilla ring (away from the lamp) — "outside the circle". Re-captures
  // on the next review (status flip resets peelT).
  useEffect(() => {
    if (status === "reviewing" && peelT.current === null) {
      peelT.current = 0;
      peelFrom.current.copy(pos.current);
      const dir = new THREE.Vector3(
        pos.current.x - LAMP_POS[0],
        0,
        pos.current.z - LAMP_POS[2],
      );
      if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0); // degenerate: at the lamp
      peelTo.current.copy(pos.current).addScaledVector(dir.normalize(), PEEL_DISTANCE);
    }
    if (status !== "reviewing") peelT.current = null;
  }, [status]);

  // Unregister the live transform on unmount.
  useEffect(() => () => dropBoatRuntime(entry.deckId), [entry.deckId]);

  useFrame(({ clock }, dt) => {
    const o = outer.current, i = inner.current;
    if (!o || !i) return;
    const t = clock.elapsedTime;
    const step = Math.min(dt, 0.05); // no physics leaps after a stall
    const orbit = orbitState(orbitNow(t)); // orbitNow: review freezes the flotilla
    const slot = dockSlotPos(dockIndex);

    // Pile slot in the orbiting flotilla frame → world (rotate by frameYaw:
    // x' = x·c + z·s, z' = −x·s + z·c). The fishboat leads; the pile trails.
    const c = Math.cos(orbit.frameYaw);
    const s = Math.sin(orbit.frameYaw);
    const slotX = orbit.x + pile.x * c + pile.z * s;
    const slotZ = orbit.z - pile.x * s + pile.z * c;

    if (!initialized.current) {
      initialized.current = true;
      pos.current.set(slotX, 0, slotZ);
      // Bow (+z in the GLB) along the orbit tangent t̂ = (−sin a, cos a).
      yaw.current = -orbit.a;
    }

    let px = pos.current.x;
    let pz = pos.current.z;

    if (status === "circle") {
      // Bow-first steering toward the pile slot: boats only move where the
      // bow points; heading turns at a capped rate, a per-boat wander swerves
      // the desired heading so paths curve organically, speed scales with
      // distance.
      const toX = slotX - px;
      const toZ = slotZ - pz;
      const d = Math.hypot(toX, toZ);
      let want = d > 0.6 ? Math.atan2(toX, toZ) : yaw.current;
      if (!reducedMotion) {
        want +=
          (Math.sin(t * 0.6 + phase) * 0.5 + Math.sin(t * 1.7 + phase * 2.3) * 0.25) *
          Math.min(1, d / 6 + 0.15);
      }
      yaw.current += THREE.MathUtils.clamp(
        wrapToPi(want - yaw.current),
        -TURN_RATE * step,
        TURN_RATE * step,
      );
      const speed = THREE.MathUtils.clamp(d * 0.9 + 0.6, MIN_SPEED, MAX_SPEED);
      px += Math.sin(yaw.current) * speed * step;
      pz += Math.cos(yaw.current) * speed * step;
    } else if (status === "docking" && dockT.current !== null) {
      if (reducedMotion) {
        dockT.current = 1; // §7.4: the path becomes an instant cut
      } else {
        dockT.current = Math.min(1, dockT.current + (dt * 1000) / DOCK_MS);
      }
      const k = easeInOutCubic(dockT.current);
      px = dockFrom.current.x + (slot[0] - dockFrom.current.x) * k;
      pz = dockFrom.current.z + (slot[2] - dockFrom.current.z) * k;
      // Ease the heading from the travel direction onto facing the lamp.
      const lampYaw = Math.atan2(LAMP_POS[0] - px, LAMP_POS[2] - pz);
      const wantYaw = dockAngleFrom.current + wrapToPi(lampYaw - dockAngleFrom.current) * k;
      yaw.current += THREE.MathUtils.clamp(
        wrapToPi(wantYaw - yaw.current),
        -TURN_RATE * step,
        TURN_RATE * step,
      );
      if (dockT.current >= 1) finishDock(entry.deckId);
    } else if (status === "docked") {
      px = slot[0];
      pz = slot[2];
      const lampYaw = Math.atan2(LAMP_POS[0] - px, LAMP_POS[2] - pz);
      yaw.current += THREE.MathUtils.clamp(
        wrapToPi(lampYaw - yaw.current),
        -TURN_RATE * step,
        TURN_RATE * step,
      );
    } else if (status === "reviewing" && peelT.current !== null && peelT.current < 1) {
      // Peel-out: the eased sail to the outpost, bow onto the travel
      // direction (arcs, never snaps). Reduced motion: instant cut (§7.4).
      if (reducedMotion) {
        peelT.current = 1;
      } else {
        peelT.current = Math.min(1, peelT.current + (dt * 1000) / PEEL_MS);
      }
      const k = easeInOutCubic(peelT.current);
      px = peelFrom.current.x + (peelTo.current.x - peelFrom.current.x) * k;
      pz = peelFrom.current.z + (peelTo.current.z - peelFrom.current.z) * k;
      const travelYaw = Math.atan2(
        peelTo.current.x - peelFrom.current.x,
        peelTo.current.z - peelFrom.current.z,
      );
      yaw.current += THREE.MathUtils.clamp(
        wrapToPi(travelYaw - yaw.current),
        -TURN_RATE * step,
        TURN_RATE * step,
      );
    }
    // "reviewing" with the peel done: holds its outpost (px/pz frozen).

    pos.current.set(px, 0, pz);
    o.position.set(px, 0, pz);
    o.rotation.y = yaw.current;

    // CPU swell bob from the shared wave table (same constants as the GPU
    // water normals — swell.ts). Small boats ride softer than the sea.
    if (reducedMotion) {
      i.position.y = 0;
      i.rotation.x = 0;
    } else {
      i.position.y = swellHeight(px, pz, t) * 0.55 - 0.05;
      i.rotation.x = swellHeight(px, pz + 1.2, t) * 0.06; // gentle pitch
    }

    writeBoatRuntime(entry.deckId, {
      angle: orbit.a,
      pos: new THREE.Vector3(px, 0, pz),
      forward: new THREE.Vector3(Math.sin(yaw.current), 0, Math.cos(yaw.current)),
    });
  });

  const interactive = status === "circle" || status === "docked";
  const open = interactive && onOpenDeck ? () => onOpenDeck(entry.deckId) : undefined;

  return (
    <group ref={outer}>
      <group ref={inner} onClick={open}>
        <primitive object={model} />
      </group>
      {status === "reviewing" && (
        <SelectionRing radius={length * 0.85} reducedMotion={reducedMotion} />
      )}
      {status === "docked" && (
        <pointLight
          color={PALETTE.lanternGlow.hex}
          intensity={1.1}
          distance={9}
          decay={2}
          position={[0, 2.2, 0]}
        />
      )}
      {/* Docked boats carry their pill lower so a tall mast never stacks two
          pills into one click target near the lamp. */}
      <group position={[0, status === "docked" ? 6.4 : 7.4, 0]}>
        <LabelPill
          text={entry.name}
          size="sm"
          worldId={`smallboat:${entry.deckId}`}
          onClick={open}
        />
      </group>
      {/* FR-2.7 export: a docked deck offers its Anki file (new tab; hidden
          while apkgUrl is null). A real <a> — natively keyboard-reachable. */}
      {status === "docked" && entry.apkgUrl && (
        <group position={[0, 5.2, 0]}>
          <Html center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
            <a
              href={`${harbourBaseUrl()}${entry.apkgUrl}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                pointerEvents: "auto",
                display: "inline-block",
                background: LABEL.fill,
                color: LABEL.text,
                boxShadow: LABEL.shadow,
                borderRadius: 999,
                padding: "4px 10px",
                fontSize: 11,
                fontWeight: 550,
                fontFamily:
                  "ui-rounded, system-ui, -apple-system, 'Segoe UI', sans-serif",
                whiteSpace: "nowrap",
                userSelect: "none",
                textDecoration: "none",
              }}
            >
              ↓ Anki deck
            </a>
          </Html>
        </group>
      )}
    </group>
  );
}

export default function Fleet() {
  const boats = useWorldStore((s) => s.boats);
  const entries = Object.values(boats);
  // Stable dock slot order among boats at (or heading to) the lamp.
  const docked = entries
    .filter((b) => b.status === "docked" || b.status === "docking")
    .sort((a, b) => a.deckId.localeCompare(b.deckId));
  const slotOf = new Map(docked.map((b, i) => [b.deckId, i]));

  return (
    <>
      {entries.map((b) => (
        <FleetBoat key={b.deckId} entry={b} dockIndex={slotOf.get(b.deckId) ?? 0} />
      ))}
    </>
  );
}
