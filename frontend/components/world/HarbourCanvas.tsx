"use client";

/**
 * HarbourCanvas.tsx — Layer A: the above-water R3F world (REQUIREMENTS §4.3.1).
 *
 * Assembles: sky dome, ocean, fishboat ("Today"), lamp buoy ("Journal"),
 * the circling fleet + docked boats (from worldStore via worldApi), review
 * POV, fog, the two-light toon rig (bright-day grade: hemisphere + warm key
 * + mauve fill, NO shadow maps — grounding is the hull-hugging reflection),
 * CameraRig, WorldOverlays.
 *
 * Endline rule (§2.4): sky h=0, the water's seam weld and the renderer clear
 * color are ONE value (Ocean.tsx MIST_COLOR), and scene fog dissolves the
 * toon props into the pale aqua haze — no plane edge can ever show.
 *
 * While underwater (worldMode === "underwater") Layer A PAUSES rendering
 * (frameloop "never") — perf, NFR-5 / §4.3.2. It stays mounted so surfacing
 * is instant; the last frame persists under the dive overlay.
 *
 * Fail loudly (AGENTS.md §2): any GLB/load failure inside the scene throws
 * through WorldErrorBoundary → an explicit soft-amber error state on screen,
 * never a silently empty canvas.
 */

import { Component, Suspense, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { PALETTE } from "@/lib/theme";
import { CAMERA_PRESETS } from "./layout";
import { useWorldStore } from "./worldStore";
import Ocean from "./Ocean";
import SkyDome from "./SkyDome";
import Fishboat from "./Fishboat";
import LampBuoy from "./LampBuoy";
import Fleet from "./Fleet";
import ReviewMode from "./ReviewMode";
import CameraRig from "./CameraRig";
import WorldOverlays from "./WorldOverlays";

type BoundaryState = { error: Error | null };

export class WorldErrorBoundary extends Component<
  { children: ReactNode },
  BoundaryState
> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            background: PALETTE.abyssTop.hex,
            zIndex: 40,
          }}
        >
          <div
            style={{
              background: PALETTE.mist.hex,
              border: `2px solid ${PALETTE.softAmber.hex}`,
              borderRadius: 14,
              padding: "18px 26px",
              maxWidth: 420,
              color: PALETTE.ink.hex,
              fontFamily: "system-ui, sans-serif",
              boxShadow: "0 6px 30px rgba(15, 18, 34, 0.25)",
            }}
          >
            <strong>The harbour could not set sail.</strong>
            <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.5 }}>
              {this.state.error.message}
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function SceneContent() {
  return (
    <>
      {/* Fog only touches the fog-enabled materials (the toon boats/lamp);
          the sky/water ShaderMaterials ignore fog by construction — the
          no-endline weld is the shaders' job (Ocean.tsx / SkyDome.tsx). */}
      <fog attach="fog" args={[PALETTE.fog.hex, 120, 1400]} />
      {/* Clear color = the horizon weld: any unshaded pixel (e.g. below a
          mirror clip plane) stays seamless with sky and far water. */}
      <color attach="background" args={[PALETTE.horizonWeld.hex]} />
      <SkyDome />
      <Ocean />

      {/* Two-light toon rig (bright-day grade): teal hemisphere ambient,
          warm FIXED key high upper-left, mauve fill on the shadow sides.
          No flat ambient, no shadow maps — grounding is the reflection. */}
      <hemisphereLight args={[PALETTE.hemiSky.hex, PALETTE.hemiGround.hex, 1.25]} />
      <directionalLight position={[-35, 80, 25]} intensity={2.3} color={PALETTE.keySun.hex} />
      <directionalLight position={[30, 18, -28]} intensity={0.55} color={PALETTE.fillMauve.hex} />

      <Suspense fallback={null}>
        <Fishboat />
        <LampBuoy />
        <Fleet />
      </Suspense>
      <ReviewMode />

      <CameraRig />
    </>
  );
}

export default function HarbourCanvas() {
  const worldMode = useWorldStore((s) => s.worldMode);
  return (
    <WorldErrorBoundary>
      <div style={{ position: "absolute", inset: 0 }}>
        <Canvas
          // §4.3.2: Layer A pauses rendering while underwater (NFR-5).
          frameloop={worldMode === "underwater" ? "never" : "always"}
          gl={{ antialias: true, toneMapping: THREE.NoToneMapping }}
          camera={{
            // 40° vfov: the measured reference frame the grade was tuned on.
            fov: 40,
            near: 0.1,
            far: 5000,
            position: [
              CAMERA_PRESETS.overview.pos[0],
              CAMERA_PRESETS.overview.pos[1],
              CAMERA_PRESETS.overview.pos[2],
            ],
          }}
          style={{ position: "absolute", inset: 0 }}
        >
          <SceneContent />
        </Canvas>
        <WorldOverlays />
      </div>
    </WorldErrorBoundary>
  );
}
