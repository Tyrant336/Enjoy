"use client";

/**
 * HarbourCanvas.tsx — Layer A: the above-water R3F world (REQUIREMENTS §4.3.1).
 *
 * Assembles: sky dome, ocean, fishboat ("Today"), lamp buoy ("Journal"),
 * the circling fleet + docked boats (from worldStore via worldApi), review
 * POV, fog, ambient-dominant lighting (the locked local visual spec:
 * overcast studio, no hard shadows), CameraRig, WorldOverlays.
 *
 * Endline rule (§2.4): scene fog uses the SHARED mist color (Ocean.tsx
 * MIST_COLOR) with full density by 700 u — the 5000 u ocean rim is always
 * deep inside full fog, so no plane edge can ever show, from any angle.
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
import Ocean, { MIST_COLOR } from "./Ocean";
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
      {/* Fog covers the near-field props (boats/lamp). The OCEAN fogs itself
          (its shader converges to MIST_COLOR with distance — Ocean.tsx), so
          the 5000 u plane rim can never show. NOTE: scene fog on the ocean's
          ShaderMaterial painted a bright rim at the waterline (fogColor not
          refreshed → white) — that path is deliberately gone. */}
      <fog attach="fog" args={[MIST_COLOR, 80, 700]} />
      <SkyDome />
      <Ocean />

      {/* Overcast-studio lighting: ambient-dominant, no cast shadows. */}
      <hemisphereLight args={[PALETTE.skyMid.hex, PALETTE.waterMid.hex, 0.9]} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[18, 30, 12]} intensity={0.55} color={PALETTE.mist.hex} />

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
            fov: 45,
            near: 0.1,
            far: 3000,
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
