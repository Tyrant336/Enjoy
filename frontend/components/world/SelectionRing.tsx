"use client";

/**
 * SelectionRing.tsx — the "this boat is selected" cue (session 032): a soft
 * cream halo floating on the water around the reviewed deck while it sails
 * out of the ring and holds its outpost. Calm lantern-cream (palette-locked,
 * never red §2.4); a slow breathing opacity pulse, frozen under reduced
 * motion (§7.4). Rendered inside the boat's outer group — it rides the hull.
 */

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PALETTE } from "@/lib/theme";

export default function SelectionRing({
  radius,
  reducedMotion,
}: {
  radius: number;
  reducedMotion: boolean;
}) {
  const mat = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(({ clock }) => {
    if (!mat.current || reducedMotion) return;
    mat.current.opacity = 0.42 + Math.sin(clock.elapsedTime * 1.4) * 0.14;
  });

  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.07, 0]}>
      <ringGeometry args={[radius * 0.78, radius, 48]} />
      <meshBasicMaterial
        ref={mat}
        color={PALETTE.lanternGlow.hex}
        transparent
        opacity={0.5}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
