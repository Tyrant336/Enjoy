"use client";

/**
 * SmallBoat.tsx — one small sailboat = one Anki flashcard deck (FR-2).
 * GLB: frontend/public/models/smallboat.glb (Kenney, CC0, locked sail-b).
 *
 * The GLB has two meshes: "boat-sail-b" (hull) and "sail". The sail's texture
 * is white-ish, so per-deck pastel tinting is a material color multiply using
 * the approved tokens only (purple/sage/grey-blue — never red, §2.4).
 * Fails loudly if the sail mesh is missing.
 *
 * The model is normalized to a world length (fitToWater) — reflections come
 * from the planar-mirror ocean (Ocean.tsx), never from mirrored clones.
 */

import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { PALETTE } from "@/lib/theme";
import { addOutlines, cloneScene, fitToWater, toToon } from "./modelUtils";

/** Hull draft below the waterline (fitToWater) and navy linework width in
 *  WORLD units (bright-day grade); the outline width is converted to
 *  geometry-local units through the fit scale. */
const DRAFT = 0.12;
const OUTLINE_WORLD = 0.1;

export function useSmallBoatModel(sailTint: string, length: number): THREE.Object3D {
  const { scene } = useGLTF("/models/smallboat.glb");

  return useMemo(() => {
    const model = cloneScene(scene);
    toToon(model);

    let sailFound = false;
    model.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      if (obj.name === "sail" || obj.name.startsWith("sail")) {
        // Sail: flat pastel tint from the approved tokens (never red, §2.4).
        const tint = new THREE.Color(sailTint);
        for (const m of mats) {
          if (
            m instanceof THREE.MeshToonMaterial ||
            m instanceof THREE.MeshStandardMaterial
          ) {
            m.color.copy(tint);
            sailFound = true;
          }
        }
      } else {
        // Hull: the dark navy sliver (the locked local visual spec).
        for (const m of mats) {
          if (
            m instanceof THREE.MeshToonMaterial ||
            m instanceof THREE.MeshStandardMaterial
          ) {
            m.color.set(PALETTE.ink.hex);
          }
        }
      }
    });
    if (!sailFound) {
      throw new Error(
        "smallboat.glb: mesh 'sail' not found — cannot tint deck sail (§2.3.2)",
      );
    }

    const fitScale = fitToWater(model, length, DRAFT);
    addOutlines(model, OUTLINE_WORLD / fitScale);
    return model;
  }, [scene, sailTint, length]);
}

useGLTF.preload("/models/smallboat.glb");
