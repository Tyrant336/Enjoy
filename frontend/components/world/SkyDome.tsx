"use client";

/**
 * SkyDome.tsx — bright-day sky: a BackSide sphere with a WORLD-SPACE
 * elevation gradient (h = dir.y), a luminous zero-tint zenith lift, and
 * painterly white puffy clouds.
 *
 * World-space, NOT screen-space (load-bearing): any mirrored render pass
 * would show a screen-space gradient flipped — a hard-edged wedge on the
 * water (real post-mortem, never re-introduce).
 *
 * Seam rule (§2.4): the gradient's h=0 stop is EXACTLY the shared horizon
 * weld color (Ocean.tsx MIST_COLOR), which is also the far-water weld and
 * the renderer clear color — sky, water and clear color are one value at
 * the horizon, so no seam from any camera angle.
 *
 * The dome re-centers on the camera every frame (it is "infinitely far").
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PALETTE } from "@/lib/theme";
import { MIST_COLOR } from "./Ocean";
import { SUN_DIR } from "./layout";

/** World-space elevation stops (h = dir.y) — remapped so h=0 matches the
 *  water's invisible-horizon band exactly. */
const SKY_STOPS: readonly (readonly [number, string])[] = [
  [0.0, MIST_COLOR], // #A4D5D7 — the horizon weld
  [0.05, "#A8D5D8"],
  [0.115, "#B1DADC"],
  [0.17, "#B5DCDE"],
  [0.22, "#B7DDDE"],
];

/** Stops injected through THREE.Color → linear working space; the shader
 *  ends with colorspace_fragment (values are final sRGB). */
function lin(hex: string): string {
  const c = new THREE.Color(hex);
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
}

function gradientGLSL(name: string, stops: readonly (readonly [number, string])[]): string {
  const lines = [`vec3 ${name}(float h) {`, `  vec3 c = ${lin(stops[0][1])};`];
  for (let i = 1; i < stops.length; i++) {
    lines.push(
      `  c = mix(c, ${lin(stops[i][1])}, smoothstep(${stops[i - 1][0].toFixed(3)}, ${stops[i][0].toFixed(3)}, h));`,
    );
  }
  lines.push("  return c;", "}");
  return lines.join("\n");
}

const VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uFog;
  uniform vec3 uCloudShadow;
  uniform vec3 uCloudBright;
  uniform vec3 uSunDir;
  uniform vec3 uSunGlow;
  varying vec3 vDir;

  ${gradientGLSL("skyGradient", SKY_STOPS)}

  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }
  // 4-octave value-noise fbm: a = 0.55, p = p·2.13 + 11.7 per octave.
  float fbm(vec2 p) {
    float s = 0.0;
    float a = 0.55;
    for (int i = 0; i < 4; i++) {
      s += a * vnoise(p);
      p = p * 2.13 + 11.7;
      a *= 0.55;
    }
    return s;
  }

  void main() {
    vec3 dir = normalize(vDir);
    float h = dir.y;

    // 1. World-space elevation gradient.
    vec3 col = skyGradient(h);

    // 2. Luminous zenith, zero hue shift: soft white-aqua lift overhead.
    col = mix(col, vec3(0.94, 0.98, 0.98), smoothstep(0.10, 0.45, h) * 0.28);

    // 2b. Soft sunlight: a hazy warm disc + wide halo at a fixed azimuth
    // (agrees with the key light's upper-left). Never a hard-edged disc —
    // the glow melts into the aqua sky.
    float sunD = max(dot(dir, uSunDir), 0.0);
    col = mix(col, uSunGlow, pow(sunD, 80.0) * 0.9 + pow(sunD, 7.0) * 0.3);

    // 3. Painterly white puffy clouds, only above h > 0.015.
    if (h > 0.015) {
      // Projection: larger divisor = rounder puffs near the horizon.
      vec2 p = dir.xz / (h + 0.45) * 1.15;
      p += vec2(uTime * 0.006, uTime * 0.0025); // slow drift
      float cl = smoothstep(0.42, 0.72, fbm(p)); // distinct billows, aqua sky between
      vec3 ccol = mix(uCloudShadow, uCloudBright, smoothstep(0.35, 0.85, fbm(p * 2.2 + 7.3)));
      ccol = mix(ccol, uFog, 0.10); // a whisper of haze, never a heavy tint
      float band = smoothstep(0.015, 0.10, h) * (1.0 - smoothstep(0.35, 0.75, h) * 0.55);
      col = mix(col, ccol, cl * 0.58 * band);
    }

    // Dither to kill 8-bit gradient banding in the soft sky.
    float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    col += (n - 0.5) * (1.5 / 255.0);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export default function SkyDome() {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uFog: { value: new THREE.Color(PALETTE.fog.hex) },
          uCloudShadow: { value: new THREE.Color(PALETTE.cloudShadow.hex) },
          uCloudBright: { value: new THREE.Color(PALETTE.cloudBright.hex) },
          // Fixed sun azimuth/elevation — azimuth matches the key light
          // (upper-left, az ≈144°), elevation low so it glows just above
          // the horizon inside the follow frame.
          uSunDir: { value: new THREE.Vector3(...SUN_DIR) },
          uSunGlow: { value: new THREE.Color(PALETTE.sunGlow.hex) },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    [],
  );

  /* eslint-disable react-hooks/immutability -- R3F idiom: writing shader
     uniforms / mesh transform on live three.js objects in the frame loop. */
  useFrame(({ clock, camera }) => {
    material.uniforms.uTime.value = clock.elapsedTime;
    // The dome is "infinitely far": it rides the camera.
    mesh.current?.position.copy(camera.position);
  });
  /* eslint-enable react-hooks/immutability */

  return (
    <mesh ref={mesh} material={material} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[1600, 48, 32]} />
    </mesh>
  );
}
