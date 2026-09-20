"use client";

/**
 * LampBuoy.tsx — the lamp / journal buoy ("Journal" pill, FR-4).
 * GLB: frontend/public/models/lamp-buoy.glb (custom, locked — §2.3.3).
 *
 * The lantern's LanternGlow material is the ONLY warm light in the scene
 * (the locked local visual spec). Its emissive intensity is driven by the
 * store's lampGlow (0..1, FR-4.4) — capped and subtle. If the GLB ever ships
 * without a LanternGlow material, we throw (fail loudly, never silent).
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { PALETTE } from "@/lib/theme";
import { LAMP_POS } from "./layout";
import { addOutlines, cloneScene, fitToWater, toToon } from "./modelUtils";
import LabelPill from "./LabelPill";
import { useWorldStore } from "./worldStore";

/** World footprint: 13 u wide, draft 0.8 — the collar visibly floats.
 *  Outline width in WORLD units. */
const LAMP_WIDTH = 13;
const LAMP_DRAFT = 0.8;
const OUTLINE_WORLD = 0.2;
/** Vertical stretch after fitting — a taller, lighthouse-like silhouette. */
const LAMP_TALL = 1.4;

export default function LampBuoy() {
  const { scene } = useGLTF("/models/lamp-buoy.glb");
  const group = useRef<THREE.Group>(null);
  const lampGlow = useWorldStore((s) => s.lampGlow);
  const lampPulseNonce = useWorldStore((s) => s.lampPulseNonce);
  const onOpenJournal = useWorldStore((s) => s.hostHandlers.onOpenJournal);
  const pulseStart = useRef<number | null>(null);

  const { model, lantern, light } = useMemo(() => {
    const model = cloneScene(scene);
    toToon(model);
    // fitToWater also centers the GLB (its origin is authored off-center).
    const fitScale = fitToWater(model, LAMP_WIDTH, LAMP_DRAFT);
    // Taller silhouette: stretch Y, then re-ground the waterline (the
    // stretch deepens the draft — restore box.min.y = −LAMP_DRAFT).
    model.scale.y *= LAMP_TALL;
    const stretched = new THREE.Box3().setFromObject(model);
    model.position.y -= stretched.min.y + LAMP_DRAFT;
    addOutlines(model, OUTLINE_WORLD / fitScale); // world-unit navy linework

    let lanternMat: THREE.MeshToonMaterial | null = null;
    model.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (m.name === "LanternGlow" && m instanceof THREE.MeshToonMaterial) {
          lanternMat = m;
        }
      }
    });
    const lantern = lanternMat as THREE.MeshToonMaterial | null;
    if (!lantern) {
      throw new Error(
        "lamp-buoy.glb: material 'LanternGlow' not found — cannot drive lamp glow (FR-4.4)",
      );
    }

    // The lantern's warm light (bright-day grade): amber, bright base with a
    // gentle 2.2 rad/s ±3 breathing pulse, long reach, physical falloff.
    const light = new THREE.PointLight(PALETTE.lampAmber.hex, 14, 70, 2);
    light.position.set(0, 26, 0); // lantern height on the tall 13 u buoy
    return { model, lantern, light };
  }, [scene]);

  // FR-2.6/FR-4.4: a warm glow pulse when the lamp gains a record.
  useEffect(() => {
    if (lampPulseNonce > 0) pulseStart.current = performance.now();
  }, [lampPulseNonce]);

  /* eslint-disable react-hooks/immutability -- R3F idiom: the frame loop
     mutates live three.js objects (mesh transforms, material emissive,
     light intensity), never React state. */
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const t = clock.elapsedTime;
    g.position.y = Math.sin(t * 0.5 + 2.1) * 0.06;
    g.rotation.z = Math.sin(t * 0.36) * 0.01;
    // FR-4.4: glow level 0..1 → emissive intensity, capped, subtle.
    let pulse = 0;
    if (pulseStart.current !== null) {
      const elapsed = (performance.now() - pulseStart.current) / 1000;
      pulse = Math.exp(-elapsed * 1.8) * 0.9; // soft 1–2 s decay
      if (elapsed > 3) pulseStart.current = null;
    }
    lantern.emissiveIntensity = (0.7 + lampGlow * 1.2) * (1 + pulse);
    // FR-4.4 glow level scales the base; the 2.2 rad/s ±3 pulse breathes on top.
    light.intensity = (14 * (0.5 + lampGlow * 0.5) + Math.sin(t * 2.2) * 3) * (1 + pulse);
  });
  /* eslint-enable react-hooks/immutability */

  return (
    <group position={[LAMP_POS[0], 0, LAMP_POS[2]]}>
      <group ref={group}>
        <primitive object={model} />
        <primitive object={light} />
      </group>
      <group position={[0, 40, 0]}>
        {/* FR-4.3: the "Journal" pill opens the journal view (records). */}
        <LabelPill text="Journal" size="md" worldId="lamp" onClick={onOpenJournal} />
      </group>
    </group>
  );
}

useGLTF.preload("/models/lamp-buoy.glb");
