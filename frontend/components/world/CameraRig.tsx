"use client";

/**
 * CameraRig.tsx — orchestrator-drivable camera (REQUIREMENTS §4.2 camera,
 * §5.3 camera_fly_to, NFR-1 ≥1500 ms eased moves, §7.4 reduced motion).
 *
 * Modes:
 *  - presets (CAMERA_PRESETS in layout.ts) via store.cameraRequest — worldApi,
 *    tours, lab buttons. Reduced motion: instant cuts (§7.4).
 *  - follow (overview/fishboat presets — one path): after the fly-to lands,
 *    the camera sails with the flotilla — each frame the flotilla's orbit
 *    delta is added to the camera and the target re-pins to the fishboat,
 *    until the user orbits away or another preset is requested.
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
import { CAMERA_PRESETS, followPose, orbitState } from "./layout";
import { hasBoatRuntime, readBoatRuntime } from "./boatRuntime";
import { registerAnchorCamera } from "./anchors";
import { orbitNow, useWorldStore, type WorldCameraPreset } from "./worldStore";
import { MOTION } from "@/lib/theme";

/** Wide-world orbit limits (bright-day grade): zoom out to map distance,
 *  never below the waterline (85° polar cap). */
const MIN_DISTANCE = 14;
const MAX_DISTANCE = 700;
const MAX_POLAR = 1.4835; // 85°
/** Lamp view: the user may zoom as close as a boat (§2.6.3). */
const LAMP_MIN_DISTANCE = 3;

/** Presets that engage the follow mode (Today/overview — one path). */
const FOLLOW_PRESETS: ReadonlySet<WorldCameraPreset> = new Set(["overview", "fishboat"]);

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
  const get = useThree((s) => s.get);
  // True while the review POV owns the camera (controls disabled for input,
  // but still the thing that writes the camera — see POV note below).
  const povActive = useRef(false);
  // Follow mode (Today/overview): the camera SAILS with the fishboat — the
  // per-frame orbit translation is added to the camera and the target
  // re-pins to the tug (dead center), while the camera keeps its own
  // bearing: the boat visibly turns in frame and the lamp/sun/world sweep
  // past over the orbit. Snap-free (transforms the current offset).
  const follow = useRef(true); // the initial framing IS the follow view
  const transitioning = useRef(false);
  const prevFrame = useRef<{ x: number; z: number } | null>(null);
  // Review-POV stern track: the chase anchor, damped per frame toward the
  // live stern pose (the boat PEELS OUT on review entry — a static pose
  // would be left behind; session 032).
  const povEye = useRef(new THREE.Vector3());
  const povLook = useRef(new THREE.Vector3());

  const flyTo = (preset: WorldCameraPreset, instant: boolean, durationMs: number = MOTION.cameraMs) => {
    const c = controls.current;
    if (!c) return;
    // Follow presets are computed live — the flotilla orbits the lamp, so a
    // static table entry would land where the fishboat WAS (layout.ts
    // followPose is the single definition of the framing). Aim at where the
    // boat WILL be when the damp settles (≈4×smoothTime = durationMs, see
    // below): the boat sails ≈4 u/s during the flight, and the per-frame
    // follow stays parked until `rest` — without the lead, every landing
    // is off-center and the resume visibly snaps.
    const p = FOLLOW_PRESETS.has(preset)
      ? followPose(orbitNow(get().clock.elapsedTime) + (instant ? 0 : durationMs / 1000))
      : CAMERA_PRESETS[preset];
    if (!p) {
      throw new Error(`CameraRig: unknown preset '${preset}'`);
    }
    follow.current = FOLLOW_PRESETS.has(preset);
    // §2.6.3: the lamp view relaxes the zoom floor so the user may orbit as
    // close as a boat; every other preset restores the wide-world floor.
    c.minDistance = preset === "lamp" ? LAMP_MIN_DISTANCE : MIN_DISTANCE;
    // smoothDamp settles in ≈4×smoothTime → ≈ the requested duration.
    c.smoothTime = instant ? 0 : durationMs / 1000 / 4;
    void c.setLookAt(p.pos[0], p.pos[1], p.pos[2], p.target[0], p.target[1], p.target[2], !instant);
  };

  // Track camera-controls' transition/user-input state for the follow mode:
  // the orbit delta is applied only after the fly-to lands, and any manual
  // orbit hands the camera to the user (follow off).
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const onTransitionStart = () => {
      transitioning.current = true;
    };
    const onRest = () => {
      transitioning.current = false;
    };
    const onControlStart = () => {
      follow.current = false;
    };
    c.addEventListener("transitionstart", onTransitionStart);
    c.addEventListener("rest", onRest);
    c.addEventListener("sleep", onRest);
    c.addEventListener("controlstart", onControlStart);
    return () => {
      c.removeEventListener("transitionstart", onTransitionStart);
      c.removeEventListener("rest", onRest);
      c.removeEventListener("sleep", onRest);
      c.removeEventListener("controlstart", onControlStart);
    };
  }, []);

  // Anchor camera + viewport for screen-space anchors (today sheet hook).
  useEffect(() => {
    registerAnchorCamera(camera, size.width, size.height);
  }, [camera, size]);

  // Initial framing — instant, before first paint of motion.
  useEffect(() => {
    flyTo("overview", true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
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
  // pose goes THROUGH camera-controls. The boat PEELS OUT of the ring on
  // entry (Fleet.tsx) — a static pose would be left behind, so the useFrame
  // loop below damps the povEye/povLook anchor onto the live stern pose
  // every frame (exponential ease from wherever the user was — ≥1500 ms to
  // settle, NFR-1; no snap, §7.4). Input stays disabled while reviewing.
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    if (reviewing) {
      c.enabled = false;
      povActive.current = true;
      // Load-bearing: camera-controls re-clamps every frame in update(). The
      // review POV sits ~2 u off the boat looking up from the waterline —
      // the default limits would silently clamp it back to a far top-down
      // view. Relax while locked; restored on exit below.
      c.minDistance = 0.5;
      c.maxPolarAngle = Math.PI * 0.75;
      if (!hasBoatRuntime(reviewing.deckId)) {
        // The fleet boat always registers its runtime before it can be opened;
        // missing runtime here is a bug — fail loudly, don't frame a guess.
        useWorldStore.getState().setWorldError("The deck boat drifted out of reach — review POV could not engage.");
        return;
      }
      // Seed the chase anchor with the CURRENT view — the damp in useFrame
      // takes it from here to the stern.
      povEye.current.copy(camera.position);
      const dir = camera.getWorldDirection(new THREE.Vector3());
      povLook.current.copy(camera.position).addScaledVector(dir, 10);
    } else {
      povActive.current = false;
      // Restore the wide-world limits relaxed for the review POV.
      c.minDistance = MIN_DISTANCE;
      c.maxPolarAngle = MAX_POLAR;
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
    // FR-5.5: every tour narration is also readable text (chat transcript,
    // §7.4) — raised through the host seam; the world never touches uiStore.
    s.hostHandlers.onTourNarrate?.(step.narration);

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
    const c = controls.current;
    // Follow mode (Today/overview): ride the ROTATING flotilla frame — each
    // frame the camera offset is rotated by the frame's yaw delta around the
    // fishboat and re-anchored to it (tug dead center, world sweeps past).
    // Snap-free: we transform the CURRENT offset, never teleport to the
    // analytic pose. orbitState is a pure function of t — nothing to
    // subscribe to. prevFrame stays fresh EVERY frame: no jump when a tween
    // ends or the POV hands back.
    const orbit = orbitState(orbitNow(clock.elapsedTime)); // orbitNow: review freeze
    if (follow.current && !povActive.current && !transitioning.current && c && prevFrame.current) {
      const dx = orbit.x - prevFrame.current.x;
      const dz = orbit.z - prevFrame.current.z;
      const cam = camera.position;
      void c.setLookAt(cam.x + dx, cam.y, cam.z + dz, orbit.x, 2.5, orbit.z, false);
    }
    prevFrame.current = { x: orbit.x, z: orbit.z };

    if (!povActive.current || !reviewing) return;
    if (!c) return;
    // Stern-corner chase: the desired pose rides the LIVE boat (it peels out
    // on review entry). Pulled well back and a touch to starboard so the 6.4 u
    // deck boat subtends ≈30° (present, not wall-to-wall) and its mast stays
    // inside the 40° vfov — the first pass (−7.8/2.4) let the boat swallow
    // the whole frame (owner report, session 032).
    if (!hasBoatRuntime(reviewing.deckId)) return; // entry guard already surfaced
    const rt = readBoatRuntime(reviewing.deckId);
    const right = new THREE.Vector3(-rt.forward.z, 0, rt.forward.x);
    const eye = rt.pos.clone().addScaledVector(rt.forward, -14.0).addScaledVector(right, 3.5);
    const look = rt.pos.clone().addScaledVector(rt.forward, 14.0);
    const k = reducedMotion ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) / 0.8);
    povEye.current.lerp(eye, k);
    povLook.current.lerp(look, k);
    void c.setLookAt(povEye.current.x, 7.0, povEye.current.z, povLook.current.x, 2.2, povLook.current.z, false);
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
      minDistance={MIN_DISTANCE}
      maxDistance={MAX_DISTANCE}
      minPolarAngle={0.05} // nearly straight down allowed (map-like top-down)
      maxPolarAngle={MAX_POLAR} // never below the water plane
    />
  );
}
