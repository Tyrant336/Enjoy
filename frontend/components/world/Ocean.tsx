"use client";

/**
 * Ocean.tsx — the calm stylized water plane (REQUIREMENTS §2.2 palette,
 * §2.4 "NO endline", the locked local visual spec; motion/feel per the
 * owner's reference video: endless water, soft mirrored reflections).
 *
 * Endline rule (owner decision, §2.4): the plane's edge must NEVER be
 * visible from any camera angle. Strategy:
 *  - the plane is huge (5000 u) — its rim sits kilometers out;
 *  - the shader CONVERGES the water color to the exact horizon color
 *    (uMist) with distance, so far water and sky are one value.
 *  - The ocean does NOT use scene fog: it is its own distance fog (one
 *    mechanism, one path — and a ShaderMaterial whose fogColor uniform is
 *    not refreshed by the renderer silently fogged the far field toward
 *    WHITE, painting a bright rim at the waterline: the rejected endline).
 *
 * Fragment logic (hue pinned to ~182°, the locked local visual spec):
 *  - saturation ramp waterDeep (near) → waterMid → waterFar (distance)
 *  - fresnel sheen in the mirror zone, clamped to dissolve before the mist
 *  - final convergence to uMist by ~600 u
 * Vertex: ±1.5 cm sine wobble only — the mood depends on a flat sea.
 */

import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PALETTE } from "@/lib/theme";

/** Fog/mist convergence color — ONE value used by ocean shader, scene fog
 *  and the sky dome's horizon, so the three meet seamlessly (§2.4). */
export const MIST_COLOR = PALETTE.horizon.hex;

const VERT = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  void main() {
    vec3 p = position;
    // ±1–2 px wobble at most (the locked local visual spec) — two slow sines.
    p.y += sin(p.x * 0.11 + uTime * 0.30) * sin(p.z * 0.09 - uTime * 0.23) * 0.015;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uDeep;
  uniform vec3 uMid;
  uniform vec3 uFar;
  uniform vec3 uSheen;
  uniform vec3 uMist;
  uniform vec3 uCamPos;
  varying vec3 vWorld;
  void main() {
    // Saturation ramp by distance from the camera (hue never changes).
    float d = length(vWorld.xz - uCamPos.xz);
    vec3 col = mix(uDeep, uMid, smoothstep(2.0, 26.0, d));
    col = mix(col, uFar, smoothstep(24.0, 140.0, d));
    // Mirror zone: grazing angles sheen toward the sky — near/mid field ONLY;
    // it dies by ~140 u so NOTHING on the water outshines the mist at the
    // horizon (a bright far-water rim was the rejected endline defect).
    vec3 vdir = normalize(vWorld - uCamPos);
    float fres = pow(1.0 - clamp(abs(vdir.y), 0.0, 1.0), 3.0);
    float sheenZone = smoothstep(6.0, 40.0, d) * (1.0 - smoothstep(60.0, 140.0, d));
    col = mix(col, uSheen, fres * sheenZone * 0.45);
    // Endless water: converge EXACTLY to the mist color well before the
    // vanishing zone (§2.4 no-endline).
    col = mix(col, uMist, smoothstep(120.0, 420.0, d));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export default function Ocean() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uDeep: { value: new THREE.Color(PALETTE.waterDeep.hex) },
          uMid: { value: new THREE.Color(PALETTE.waterMid.hex) },
          uFar: { value: new THREE.Color(PALETTE.waterFar.hex) },
          uSheen: { value: new THREE.Color(PALETTE.waterSheen.hex) },
          uMist: { value: new THREE.Color(MIST_COLOR) },
          uCamPos: { value: new THREE.Vector3() },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
      }),
    [],
  );

  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0} frustumCulled={false}>
      <planeGeometry args={[5000, 5000, 96, 96]} />
      <primitive object={material} attach="material" />
      <OceanClock material={material} />
    </mesh>
  );
}

/** Tiny separate clock so Ocean stays declarative. */
function OceanClock({ material }: { material: THREE.ShaderMaterial }) {
  /* eslint-disable react-hooks/immutability -- R3F idiom: writing shader
     uniforms on a live three.js material inside the frame loop. */
  useFrame(({ clock, camera }) => {
    material.uniforms.uTime.value = clock.elapsedTime;
    material.uniforms.uCamPos.value.copy(camera.position);
  });
  /* eslint-enable react-hooks/immutability */
  return null;
}
