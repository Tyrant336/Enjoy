"use client";

/**
 * Fishboat.tsx — the protagonist ("Today", Scheduler Agent home).
 * GLB: frontend/public/models/fishboat.glb (custom, locked — §2.3.1).
 * Look: toon fills + inverted-hull navy outline + mirrored water reflection,
 * slow gentle bobbing only (NFR-1). A broken/missing GLB throws through the
 * ErrorBoundary in HarbourCanvas → soft-amber error state (fail loudly,
 * AGENTS.md §2).
 *
 * Task-sheet hook (Phase 2): registers the "today" screen-space anchor
 * (anchors.ts — Agent L's TaskSheet positions itself from it) and clicking
 * the "Today" pill glides the camera to the fishboat preset, then notifies
 * the host (onOpenToday) so L can open the sheet (FR-1.6).
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { FISHBOAT_POS } from "./layout";
import { addOutlines, cloneScene, makeReflection, toToon } from "./modelUtils";
import { registerAnchor } from "./anchors";
import LabelPill from "./LabelPill";
import { useWorldStore } from "./worldStore";

export default function Fishboat() {
  const { scene } = useGLTF("/models/fishboat.glb");
  const group = useRef<THREE.Group>(null);
  const pillAnchor = useRef<THREE.Group>(null);
  const requestCamera = useWorldStore((s) => s.requestCamera);
  const onOpenToday = useWorldStore((s) => s.hostHandlers.onOpenToday);

  const { model, reflection } = useMemo(() => {
    const model = cloneScene(scene);
    toToon(model);
    addOutlines(model, 0.02);
    return { model, reflection: makeReflection(model, 0.55, 6.0) };
  }, [scene]);

  // "today" anchor: world position of the point above the pill.
  useEffect(() => {
    const anchor = pillAnchor.current;
    if (!anchor) return;
    const v = new THREE.Vector3();
    return registerAnchor("today", () => anchor.getWorldPosition(v));
  }, []);

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const t = clock.elapsedTime;
    g.position.y = Math.sin(t * 0.55) * 0.07; // slow bob
    g.rotation.z = Math.sin(t * 0.42 + 1.2) * 0.012; // barely-there roll
  });

  const openToday = () => {
    requestCamera("fishboat"); // the "open sheet" camera move (FR-1.6.1)
    onOpenToday?.();
  };

  return (
    <group position={[FISHBOAT_POS[0], 0, FISHBOAT_POS[2]]} rotation-y={0.12}>
      <group ref={group} onClick={openToday}>
        <primitive object={model} />
        <primitive object={reflection} />
      </group>
      {/* Pill floats ~0.3 object-heights above the boat (the locked local visual spec). */}
      <group ref={pillAnchor} position={[0, 6.8, 0]}>
        <LabelPill text="Today" size="lg" worldId="fishboat" onClick={openToday} />
      </group>
    </group>
  );
}

useGLTF.preload("/models/fishboat.glb");
