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
 *    dwells, advances; skippable via the "Skip tour" control (WorldOverlays).
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

const vEye = new THREE.Vector3();
const vLook = new THREE.Vector3();

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
  // True while the POV approach is still converging (expo approach).
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

  // Review POV entry/exit: hand the camera between camera-controls and the
  // manual POV approach (frame loop below).
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    if (reviewing) {
      c.enabled = false;
      povActive.current = true;
    } else {
      povActive.current = false;
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

  useFrame(({ clock }, dt) => {
    // Keep the anchor camera registration fresh without effect churn.
    if (!povActive.current || !reviewing) return;
    if (!hasBoatRuntime(reviewing.deckId)) return;
    const rt = readBoatRuntime(reviewing.deckId);

    // First-person POV on the stern, looking over the bow (FR-2.5.1).
    const bob = reducedMotion ? 0 : Math.sin(clock.elapsedTime * 0.7) * 0.05;
    vEye.copy(rt.pos).addScaledVector(rt.forward, -1.5);
    vEye.y = 1.15 + bob;
    vLook.copy(rt.pos).addScaledVector(rt.forward, 7.5);
    vLook.y = 1.4;

    if (reducedMotion) {
      camera.position.copy(vEye); // §7.4: instant cut
    } else {
      const k = 1 - Math.pow(0.02, dt); // settles in ≈1.8–2.0 s (NFR-1 ≥1500 ms)
      camera.position.lerp(vEye, k);
    }
    camera.lookAt(vLook);
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
