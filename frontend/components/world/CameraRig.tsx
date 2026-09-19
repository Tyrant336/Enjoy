"use client";

/**
 * CameraRig.tsx — orchestrator-drivable camera (REQUIREMENTS §4.2 camera,
 * §5.3 camera_fly_to, NFR-1 ≥1500 ms eased moves, §7.4 reduced motion).
 *
 * Modes:
 *  - presets (CAMERA_PRESETS in layout.ts) via store.cameraRequest — worldApi,
 *    tours, lab buttons. Reduced motion: instant cuts (§7.4).
 *  - review POV (FR-2.5.1): while reviewing, camera-controls is disabled and
 *    the camera glides onto the deck boat's stern (≥1500 ms eased approach),
 *    then holds a gentle bob with no forced rotation (motion-sickness safe).
 *  - tour runner (FR-5.3): applies each roadmap step (camera preset or dive),
 *    dwells, advances; skippable via Agent L's TourUI (ends store.tour).
 *
 * Also registers the anchor camera for screen-space anchors (anchors.ts).
 */

import { useEffect, useRef } from "react";
import { CameraControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type CameraControlsImpl from "camera-controls";
import { CAMERA_PRESETS } from "./layout";
import { hasBoatRuntime, readBoatRuntime } from "./boatRuntime";
import { registerAnchorCamera } from "./anchors";
import { useWorldStore, type WorldCameraPreset } from "./worldStore";
import { MOTION } from "@/lib/theme";

export default function CameraRig() {
  const controls = useRef<CameraControlsImpl>(null);
  const cameraRequest = useWorldStore((s) => s.cameraRequest);
  const worldMode = useWorldStore((s) => s.worldMode);
  const diveDestination = useWorldStore((s) => s.diveDestination);
  const reducedMotion = useWorldStore((s) => s.reducedMotion);
  const reviewing = useWorldStore((s) => s.reviewing);
  const tour = useWorldStore((s) => s.tour);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  // True while the review POV owns the camera (controls disabled for input,
  // but still the thing that writes the camera — see POV note below).
  const povActive = useRef(false);

  const flyTo = (preset: WorldCameraPreset, instant: boolean, durationMs: number = MOTION.cameraMs) => {
    const c = controls.current;
    if (!c) return;
    const p = CAMERA_PRESETS[preset];
    if (!p) {
      throw new Error(`CameraRig: unknown preset '${preset}'`);
    }
    // smoothDamp settles in ≈4×smoothTime → ≈ the requested duration.
    c.smoothTime = instant ? 0 : durationMs / 1000 / 4;
    void c.setLookAt(p.pos[0], p.pos[1], p.pos[2], p.target[0], p.target[1], p.target[2], !instant);
  };

  // Anchor camera + viewport for screen-space anchors (today sheet hook).
  useEffect(() => {
    registerAnchorCamera(camera, size.width, size.height);
  }, [camera, size]);

  // Initial framing — instant, before first paint of motion.
  useEffect(() => {
    flyTo("overview", true);
  }, []);

  // worldApi / tour / lab preset requests.
  useEffect(() => {
    if (cameraRequest.nonce === 0) return; // nonce 0 = initial mount state
    if (reviewing) return; // POV owns the camera while reviewing
    flyTo(cameraRequest.preset, reducedMotion, cameraRequest.durationMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by nonce
  }, [cameraRequest.nonce]);

  // Dive: the camera descends toward the water (motion-sickness safe: a slow
  // level descent, no forced rotation, never below the surface — §7.4).
  useEffect(() => {
    if (worldMode === "diving" && diveDestination === "underwater") {
      flyTo("underwater", reducedMotion, MOTION.diveMs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mode transition only
  }, [worldMode, diveDestination]);

  // Review POV entry/exit (FR-2.5.1): the camera glides onto the deck boat's
  // stern, looking over the bow. IMPORTANT: camera-controls' update() writes
  // camera.position/lookAt EVERY frame even when disabled, so a manual lerp
  // gets overwritten (the "stuck at overview distance" bug). One way: the POV
  // pose goes THROUGH camera-controls (setLookAt tween ≥1500 ms, NFR-1);
  // input stays disabled while reviewing. The boat holds position during
  // review (Fleet freezes it), so a single static pose is exact.
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    if (reviewing) {
      c.enabled = false;
      povActive.current = true;
      if (!hasBoatRuntime(reviewing.deckId)) {
        // The fleet boat always registers its runtime before it can be opened;
        // missing runtime here is a bug — fail loudly, don't frame a guess.
        useWorldStore.getState().setWorldError("The deck boat drifted out of reach — review POV could not engage.");
        return;
      }
      const rt = readBoatRuntime(reviewing.deckId);
      // Stern-corner POV: pulled back and a touch to starboard so the boat's
      // own mast doesn't block the card boat ahead (visual review).
      const right = new THREE.Vector3(-rt.forward.z, 0, rt.forward.x);
      const eye = rt.pos.clone().addScaledVector(rt.forward, -1.9).addScaledVector(right, 0.55);
      const look = rt.pos.clone().addScaledVector(rt.forward, 7.5);
      // ≈1.8–2.0 s eased approach (smoothDamp settles in ≈4×smoothTime).
      c.smoothTime = reducedMotion ? 0 : 1.8 / 4;
      void c.setLookAt(eye.x, 1.6, eye.z, look.x, 1.1, look.z, !reducedMotion);
    } else {
      povActive.current = false;
      void c.setFocalOffset(0, 0, 0, false); // clear any residual POV bob
      // Sync camera-controls to wherever the POV left the camera BEFORE
      // re-enabling, otherwise it snaps back to its stale internal state.
      const dir = camera.getWorldDirection(new THREE.Vector3());
      void c.setLookAt(
        camera.position.x,
        camera.position.y,
        camera.position.z,
        camera.position.x + dir.x * 10,
        camera.position.y + dir.y * 10,
        camera.position.z + dir.z * 10,
        false,
      );
      c.enabled = true;
      flyTo("overview", reducedMotion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- POV handoff only
  }, [reviewing]);

  // Tour runner: apply the current step, dwell, advance (FR-5.3).
  useEffect(() => {
    if (!tour) return;
    const s = useWorldStore.getState();
    const step = tour.roadmap.steps[tour.stepIndex];
    if (!step) {
      s.endTour();
      return;
    }
    const target = step.target;
    useWorldStore.setState({ tourLabelTarget: target });

    let dwellMs = reducedMotion ? 2800 : 1900 + 2700; // move + read
    if (step.cameraPreset === "underwater" || target === "underwater") {
      s.dive();
      dwellMs = reducedMotion ? 2800 : MOTION.diveMs + 3200;
    } else {
      if (s.worldMode !== "harbour") s.surface();
      const preset: WorldCameraPreset = target === "lamp" ? "lamp" : step.cameraPreset;
      s.requestCamera(preset);
    }
    const t = setTimeout(() => useWorldStore.getState().advanceTour(), dwellMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by tour step
  }, [tour?.roadmap.id, tour?.stepIndex, reducedMotion]);

  useFrame(({ clock }) => {
    if (!povActive.current || !reviewing) return;
    const c = controls.current;
    if (!c) return;
    // Gentle bob with no forced rotation (motion-sickness safe, §7.4).
    // Focal offset rides camera-controls' own write path, so it never fights
    // the pose tween.
    const bob = reducedMotion ? 0 : Math.sin(clock.elapsedTime * 0.7) * 0.05;
    void c.setFocalOffset(0, bob, 0, false);
  });

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={4}
      maxDistance={60}
      minPolarAngle={0.35}
      maxPolarAngle={Math.PI / 2 - 0.04} // never below the water plane
    />
  );
}
