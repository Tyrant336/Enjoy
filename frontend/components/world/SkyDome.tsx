"use client";

/**
 * SkyDome.tsx — pale misty sky (the locked local visual spec). A BackSide
 * sphere with a soft vertical gradient: pale cyan zenith, deepened horizon,
 * and a SUBTLE warm-white haze band above the horizon.
 *
 * Endline rule (§2.4): the dome's horizon color is EXACTLY the shared mist
 * color (Ocean.tsx MIST_COLOR = scene fog color), so sky, fog and far water
 * converge to one value — no seam, no glowing band, from any camera angle.
 * The haze band is deliberately weak; a bright band at the waterline was the
 * rejected "endline" defect.
 */

import { useMemo } from "react";
import * as THREE from "three";
import { PALETTE } from "@/lib/theme";
import { MIST_COLOR } from "./Ocean";

const VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uMist;
  varying vec3 vDir;
  void main() {
    float h = normalize(vDir).y;
    vec3 col = mix(uHorizon, uMid, smoothstep(0.015, 0.20, h));
    col = mix(col, uTop, smoothstep(0.18, 0.65, h));
    // Warm haze floats WELL above the waterline (peaks h≈0.13, gone by
    // h≈0.05) — a bright band AT the waterline was the rejected endline.
    float band = smoothstep(0.26, 0.13, h) * smoothstep(0.05, 0.13, h);
    col = mix(col, uMist, band * 0.18);
    // Convergence: at/below the horizon the sky is EXACTLY the shared mist
    // color and eases out of it — zero luminance step at the waterline.
    col = mix(uHorizon, col, smoothstep(-0.01, 0.055, h));
    // Dither to kill 8-bit gradient banding in the soft sky.
    float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    col += (n - 0.5) * (1.5 / 255.0);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export default function SkyDome() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTop: { value: new THREE.Color(PALETTE.skyTop.hex) },
          uMid: { value: new THREE.Color(PALETTE.skyMid.hex) },
          uHorizon: { value: new THREE.Color(MIST_COLOR) },
          uMist: { value: new THREE.Color(PALETTE.mist.hex) },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    [],
  );
  return (
    <mesh material={material} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[1500, 32, 24]} />
    </mesh>
  );
}
