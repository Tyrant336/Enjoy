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
import { addOutlines, cloneScene, makeReflection, toToon } from "./modelUtils";
import LabelPill from "./LabelPill";
import { useWorldStore } from "./worldStore";

/** The GLB was authored with its origin 12 units off-center (see session 012). */
const GLB_OFFSET_X = -12;

export default function LampBuoy() {
  const { scene } = useGLTF("/models/lamp-buoy.glb");
  const group = useRef<THREE.Group>(null);
  const lampGlow = useWorldStore((s) => s.lampGlow);
  const lampPulseNonce = useWorldStore((s) => s.lampPulseNonce);
  const pulseStart = useRef<number | null>(null);

  const { model, reflection, lantern, light } = useMemo(() => {
    const model = cloneScene(scene);
    toToon(model);
    addOutlines(model, 0.03);

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

    const reflection = makeReflection(model, 0.6, 6.0);
    const light = new THREE.PointLight(PALETTE.lanternGlow.hex, 2, 16, 2);
    light.position.set(0, 3.9, 0); // lantern height, after recentering
    return { model, reflection, lantern, light };
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
    light.intensity = (1.2 + lampGlow * 2.2) * (1 + pulse);
  });
  /* eslint-enable react-hooks/immutability */

  return (
    <group position={[LAMP_POS[0], 0, LAMP_POS[2]]}>
      <group ref={group}>
        <group position={[GLB_OFFSET_X, 0, 0]}>
          <primitive object={model} />
          <primitive object={reflection} />
        </group>
        <primitive object={light} />
      </group>
      <group position={[0, 6.6, 0]}>
        <LabelPill text="Journal" size="md" worldId="lamp" />
      </group>
    </group>
  );
}

useGLTF.preload("/models/lamp-buoy.glb");
