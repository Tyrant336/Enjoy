"use client";

/**
 * Fishboat.tsx — the protagonist ("Today", Scheduler Agent home).
 * GLB: frontend/public/models/fishboat.glb (custom, locked — §2.3.1).
 * Look: toon fills + subject-palette grade + inverted-hull navy outline;
 * its reflection comes from the planar-mirror ocean (Ocean.tsx), never from
 * a mirrored clone. Motion: the fishboat LEADS the flotilla around the lamp
 * (layout.ts orbitState, FR-2.4) and rides the CPU swell (same wave table as
 * the GPU water normals). A broken/missing GLB throws through the
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
import { FISHBOAT_POS, orbitState } from "./layout";
import { addOutlines, cloneScene, fitToWater, toToon } from "./modelUtils";
import { swellHeight } from "./swell";
import { registerAnchor } from "./anchors";
import LabelPill from "./LabelPill";
import { orbitNow, useWorldStore } from "./worldStore";

/** World footprint (locked composition): 12 u long, draft 1.0 — the hull
 *  visibly floats. Hero outline width in WORLD units. */
const FISHBOAT_LENGTH = 32;
const FISHBOAT_DRAFT = 2.0;
const OUTLINE_WORLD = 0.3;

/**
 * Subject palette grade (bright-day), applied by material name. The GLB is
 * locked (§2.3.1): an unknown material name means the model changed under
 * us — throw, never silently ship the wrong colors (AGENTS.md §2).
 * All hues stay outside the forbidden red range 345°–15° (NFR-2).
 */
const MATERIAL_GRADE: Record<string, string> = {
  Cream: "#F7F1DE", // cabin walls → warm cream
  Deck: "#DFC1AF", // deck → pale warm
  Charcoal: "#4E5D82", // trim/masts/funnel → soft slate-navy (never black)
  GlassDark: "#CDE4E8", // windows → pale aqua glass
};

/** Mesh-level override: "Hull" shares the Cream material with the wheelhouse,
 *  so a material-name remap alone cannot split them — the tug's hull reads
 *  navy/dark, the cabin cream. */
const MESH_GRADE: Record<string, string> = {
  Hull: "#F7F1DE", // hull → sunlit cream (owner: no near-black masses)
};

export default function Fishboat() {
  const { scene } = useGLTF("/models/fishboat.glb");
  const outer = useRef<THREE.Group>(null);
  const bobber = useRef<THREE.Group>(null);
  const pillAnchor = useRef<THREE.Group>(null);
  const requestCamera = useWorldStore((s) => s.requestCamera);
  const onOpenToday = useWorldStore((s) => s.hostHandlers.onOpenToday);
  const reducedMotion = useWorldStore((s) => s.reducedMotion);

  const model = useMemo(() => {
    const model = cloneScene(scene);
    toToon(model);
    model.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const hex = MESH_GRADE[obj.name];
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (!(m instanceof THREE.MeshToonMaterial)) continue;
        const target = hex ?? MATERIAL_GRADE[m.name];
        if (!target) {
          throw new Error(
            `fishboat.glb: no palette grade for material '${m.name}' (mesh '${obj.name}') — the locked GLB changed (§2.3.1)`,
          );
        }
        m.color.set(target);
      }
    });
    const fitScale = fitToWater(model, FISHBOAT_LENGTH, FISHBOAT_DRAFT);
    addOutlines(model, OUTLINE_WORLD / fitScale); // world-unit navy linework
    return model;
  }, [scene]);

  // "today" anchor: world position of the point above the pill.
  useEffect(() => {
    const anchor = pillAnchor.current;
    if (!anchor) return;
    const v = new THREE.Vector3();
    return registerAnchor("today", () => anchor.getWorldPosition(v));
  }, []);

  useFrame(({ clock }) => {
    const o = outer.current;
    const b = bobber.current;
    if (!o || !b) return;
    const t = clock.elapsedTime;
    // The fishboat leads the flotilla around the lamp (layout.ts orbitState).
    const orbit = orbitState(orbitNow(t)); // orbitNow: review freezes the flotilla
    o.position.set(orbit.x, 0, orbit.z);
    o.rotation.y = orbit.frameYaw; // bow (+x in the GLB) along the travel tangent
    if (reducedMotion) {
      b.position.y = 0;
      b.rotation.x = 0;
      b.rotation.z = 0;
      return;
    }
    // CPU swell bob from the shared wave table (swell.ts — same constants as
    // the GPU water normals). Pitch/roll come from the swell gradient by
    // central differences (e = 1.2, ·0.7).
    const { x, z } = orbit;
    const e = 1.2;
    const hx = swellHeight(x + e, z, t) - swellHeight(x - e, z, t);
    const hz = swellHeight(x, z + e, t) - swellHeight(x, z - e, t);
    b.position.y = swellHeight(x, z, t) - 0.15;
    b.rotation.z = Math.atan2(hx, 2 * e) * 0.7; // pitch (bow is +x in the GLB)
    b.rotation.x = -Math.atan2(hz, 2 * e) * 0.7; // roll
  });

  const openToday = () => {
    requestCamera("fishboat"); // the "open sheet" camera move (FR-1.6.1)
    onOpenToday?.();
  };

  return (
    <group ref={outer} position={[FISHBOAT_POS[0], 0, FISHBOAT_POS[2]]}>
      <group ref={bobber} onClick={openToday}>
        <primitive object={model} />
      </group>
      {/* Pill floats just above the masthead of the 32 u tug. */}
      <group ref={pillAnchor} position={[0, 26, 0]}>
        <LabelPill text="Today" size="lg" worldId="fishboat" onClick={openToday} />
      </group>
    </group>
  );
}

useGLTF.preload("/models/fishboat.glb");
