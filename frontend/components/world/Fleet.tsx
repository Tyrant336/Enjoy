"use client";

/**
 * Fleet.tsx — the small-boat fleet (FR-2.4, §2.3.2), driven by worldStore
 * (which is written only through worldApi). Statuses (§2.5):
 *   circle    — due decks circle the lamp behind the fishboat (today's queue)
 *   reviewing — the opened deck holds position (POV handled by CameraRig)
 *   docking   — completed deck sails an eased path to its lamp slot (FR-2.6)
 *   docked    — rests at the lamp with a warm low glow
 * Motion: gentle bobbing + slight roll only (NFR-1). Reduced motion (§7.4):
 * the dock path becomes an instant cut; bobbing is skipped.
 *
 * Live per-frame transforms go to boatRuntime (not the store) — CameraRig,
 * ReviewMode and the dock path read from there.
 */

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PALETTE } from "@/lib/theme";
import { FLEET_CIRCLE, LAMP_POS, LEADER_SCALE_MULT, SMALLBOAT_SCALE, dockSlotPos } from "./layout";
import { useSmallBoatModel } from "./SmallBoat";
import { dropBoatRuntime, writeBoatRuntime } from "./boatRuntime";
import LabelPill from "./LabelPill";
import { useWorldStore, type BoatEntry } from "./worldStore";

const BOB = 0.05;
const DOCK_MS = 2200;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function FleetBoat({ entry, dockIndex }: { entry: BoatEntry; dockIndex: number }) {
  const { model, reflection } = useSmallBoatModel(entry.sailTint);
  const reducedMotion = useWorldStore((s) => s.reducedMotion);
  const finishDock = useWorldStore((s) => s.finishDock);
  const onOpenDeck = useWorldStore((s) => s.hostHandlers.onOpenDeck);

  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const angle = useRef(entry.baseAngle);
  // Dock path state: captured when status flips to "docking".
  const dockT = useRef<number | null>(null);
  const dockFrom = useRef(new THREE.Vector3());
  const dockAngleFrom = useRef(0);

  const scale = SMALLBOAT_SCALE * (entry.leader ? LEADER_SCALE_MULT : 1);
  const status = entry.status;

  // Capture the dock start pose exactly once per docking run.
  useEffect(() => {
    if (status === "docking" && dockT.current === null) {
      dockT.current = 0;
      dockFrom.current.set(
        FLEET_CIRCLE.center[0] + Math.cos(angle.current) * FLEET_CIRCLE.radius,
        0,
        FLEET_CIRCLE.center[2] + Math.sin(angle.current) * FLEET_CIRCLE.radius,
      );
      dockAngleFrom.current = angle.current;
    }
    if (status !== "docking") dockT.current = null;
  }, [status]);

  // Unregister the live transform on unmount.
  useEffect(() => () => dropBoatRuntime(entry.deckId), [entry.deckId]);

  useFrame(({ clock }, dt) => {
    const o = outer.current, i = inner.current;
    if (!o || !i) return;
    const t = clock.elapsedTime;
    const slot = dockSlotPos(dockIndex);

    if (status === "circle") angle.current += dt * FLEET_CIRCLE.angularSpeed;
    const a = angle.current;
    const cx = FLEET_CIRCLE.center[0] + Math.cos(a) * FLEET_CIRCLE.radius;
    const cz = FLEET_CIRCLE.center[2] + Math.sin(a) * FLEET_CIRCLE.radius;

    let px = cx, pz = cz, ry = -a;

    if (status === "docking" && dockT.current !== null) {
      if (reducedMotion) {
        dockT.current = 1; // §7.4: the path becomes an instant cut
      } else {
        dockT.current = Math.min(1, dockT.current + (dt * 1000) / DOCK_MS);
      }
      const k = easeInOutCubic(dockT.current);
      px = dockFrom.current.x + (slot[0] - dockFrom.current.x) * k;
      pz = dockFrom.current.z + (slot[2] - dockFrom.current.z) * k;
      // Face the lamp while settling in.
      ry = -dockAngleFrom.current + (Math.atan2(LAMP_POS[0] - px, LAMP_POS[2] - pz) + dockAngleFrom.current) * k;
      if (dockT.current >= 1) finishDock(entry.deckId);
    } else if (status === "docked") {
      px = slot[0];
      pz = slot[2];
      ry = Math.atan2(LAMP_POS[0] - px, LAMP_POS[2] - pz);
    }
    // "reviewing": holds its circle position (px/pz already frozen with a).

    o.position.set(px, 0, pz);
    o.rotation.y = ry;

    const bobScale = status === "docked" ? 0.6 : 1;
    i.position.y = reducedMotion ? 0 : Math.sin(t * 0.7 + entry.baseAngle * 3.1) * BOB * bobScale;
    i.rotation.z = reducedMotion ? 0 : Math.sin(t * 0.5 + entry.baseAngle * 1.7) * 0.03 * bobScale;

    writeBoatRuntime(entry.deckId, {
      angle: a,
      pos: new THREE.Vector3(px, 0, pz),
      forward: new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry)),
    });
  });

  const interactive = status === "circle" || status === "docked";
  const open = interactive && onOpenDeck ? () => onOpenDeck(entry.deckId) : undefined;

  return (
    <group ref={outer}>
      <group ref={inner} scale={scale} onClick={open}>
        <primitive object={model} />
        <primitive object={reflection} />
      </group>
      {status === "docked" && (
        <pointLight
          color={PALETTE.lanternGlow.hex}
          intensity={1.1}
          distance={5}
          decay={2}
          position={[0, 1.2, 0]}
        />
      )}
      {/* Docked boats carry their pill lower so a circling boat passing the
          lamp never stacks two pills into one click target. */}
      <group position={[0, status === "docked" ? 1.45 : 2.0, 0]}>
        <LabelPill
          text={entry.name}
          size="sm"
          worldId={`smallboat:${entry.deckId}`}
          onClick={open}
        />
      </group>
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
