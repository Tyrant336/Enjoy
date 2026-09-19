"use client";

/**
 * Ocean.tsx — the calm stylized water plane (REQUIREMENTS §2.2 palette,
 * §2.4 "NO endline", the locked local visual spec; motion/feel per the
 * owner's reference video: endless water, soft mirrored reflections).
 *
 * Endline rule (owner decision, §2.4): the plane's edge must NEVER be
 * visible from any camera angle. Strategy:
 *  - the plane is huge (5000 u) — its rim sits kilometers out, far beyond
 *    the fog's full-density distance;
 *  - the shader CONVERGES the water color to the exact fog/horizon color
 *    (uMist) with distance, so far water and mist are one value;
 *  - scene fog (same color) finishes the job — sky dome, fog and far water
 *    all meet at the same hue/value → no seam, no band, from any angle.
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
  #include <fog_pars_vertex>
  void main() {
    vec3 p = position;
    // ±1–2 px wobble at most (the locked local visual spec) — two slow sines.
    p.y += sin(p.x * 0.11 + uTime * 0.30) * sin(p.z * 0.09 - uTime * 0.23) * 0.015;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
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
  #include <fog_pars_fragment>
  void main() {
    // Saturation ramp by distance from the camera (hue never changes).
    float d = length(vWorld.xz - uCamPos.xz);
    vec3 col = mix(uDeep, uMid, smoothstep(2.0, 26.0, d));
    col = mix(col, uFar, smoothstep(24.0, 140.0, d));
    // Mirror zone: grazing angles sheen toward the sky — but ONLY in the
    // near/mid field; it must die out long before the mist (endline rule).
    vec3 vdir = normalize(vWorld - uCamPos);
    float fres = pow(1.0 - clamp(abs(vdir.y), 0.0, 1.0), 3.0);
    float sheenZone = smoothstep(6.0, 40.0, d) * (1.0 - smoothstep(90.0, 260.0, d));
    col = mix(col, uSheen, fres * sheenZone * 0.55);
    // Endless water: converge EXACTLY to the mist color (§2.4 no-endline).
    col = mix(col, uMist, smoothstep(150.0, 620.0, d));
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export default function Ocean() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([
          THREE.UniformsLib.fog,
          {
            uTime: { value: 0 },
            uDeep: { value: new THREE.Color(PALETTE.waterDeep.hex) },
            uMid: { value: new THREE.Color(PALETTE.waterMid.hex) },
            uFar: { value: new THREE.Color(PALETTE.waterFar.hex) },
            uSheen: { value: new THREE.Color(PALETTE.waterSheen.hex) },
            uMist: { value: new THREE.Color(MIST_COLOR) },
            uCamPos: { value: new THREE.Vector3() },
          },
        ]),
        vertexShader: VERT,
        fragmentShader: FRAG,
        fog: true,
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
