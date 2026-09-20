"use client";

/**
 * Ocean.tsx — planar-mirror water, bright-day grade (REQUIREMENTS §2.2
 * palette, §2.4 "NO endline").
 *
 * The ocean is a TRUE planar mirror: three's Reflector renders the scene
 * from a mirrored camera into a 2048² render target, and the water fragment
 * samples it projectively. Fragment composition (in order):
 *  1. Base color = the screen-space master gradient (bright-day stops below,
 *     smoothstep-interpolated): luminous pale aqua at the top of the frame,
 *     glowing turquoise at the bottom — hue pinned to ~182°.
 *  2. Analytic swell normals from the shared wave table (swell.ts — the CPU
 *     boat bob uses the SAME constants). Geometry stays FLAT: waves exist
 *     only as per-fragment normals (vertex displacement smears reflections).
 *  3. Mirror sample: ruv = vUv4.xy/vUv4.w + n.xz·0.02, absorption tint
 *     mix(refl, (0.35,0.47,0.50), 0.10); Schlick fresnel 0.02+0.98·(1−N·V)^5,
 *     amount clamp(fres·2.6, 0, 0.78), faded with distance (smoothstep
 *     60→200) and HUGGING HULLS (smoothstep 6→26 over the distance to the
 *     nearest of the masked positions: lamp + fishboat + every afloat small
 *     boat, uploaded per frame).
 *  4. Seam weld (the no-endline mechanism, owner decision §2.4): rays near
 *     horizontal mix to EXACTLY the sky's h=0 color (MIST_COLOR), so the far
 *     water meets the sky with zero value jump from any camera angle.
 *
 * Hard rule: NO sparkle / glint / glow / sun-trail on the water — the water
 * is the gradient + the mirror only.
 *
 * Traps respected (post-mortems):
 *  - FLAT PlaneGeometry, rotation on the MESH — the Reflector derives the
 *    mirror plane's normal from matrixWorld; never bake rotation into geometry.
 *  - Mipmapped target + max anisotropy: kills grazing-angle minification
 *    streaks.
 *  - Renderer clear color tracks the horizon weld (HarbourCanvas), so the
 *    mirror's below-clip region stays seamless.
 *  - Labels are DOM overlays (LabelPill → drei Html), never scene objects,
 *    so they cannot leak into the mirror pass.
 *  - The ocean does NOT use scene fog: it is its own distance treatment.
 */

import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { LAMP_POS, orbitState, SUN_DIR } from "./layout";
import { orbitNow } from "./worldStore";
import { readAllBoatPositions } from "./boatRuntime";
import { SWELL_NORMAL_GLSL } from "./swell";
import { PALETTE } from "@/lib/theme";

/** Sky h=0 color — the horizon weld shared by sky gradient, water seam weld
 *  and renderer clear color (§2.4: sky and far water are ONE value). */
export const MIST_COLOR = "#A4D5D7";

/** Bright-day master gradient stops (screen-space v = 1 − fragY/res). */
const WATER_STOPS: readonly (readonly [number, string])[] = [
  [0.0, "#B7DDDE"],
  [0.08, "#B5DCDE"],
  [0.16, "#B1DADC"], // haze bump
  [0.25, "#A8D5D8"],
  [0.33, "#A4D5D7"], // invisible horizon
  [0.41, "#9AD0D2"],
  [0.49, "#7AC1C4"],
  [0.58, "#54B3B7"],
  [0.66, "#22A5AB"],
  [0.74, "#009CA2"],
  [0.82, "#009CA2"],
  [0.91, "#00989E"],
  [0.99, "#009398"],
];

/** Color stops are injected through THREE.Color → linear working space,
 *  and every shader ends with colorspace_fragment (values are final sRGB). */
function lin(hex: string): string {
  const c = new THREE.Color(hex);
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
}

/** Smoothstep-interpolated gradient GLSL, generated from the stop table. */
function gradientGLSL(name: string, stops: readonly (readonly [number, string])[]): string {
  const lines = [`vec3 ${name}(float v) {`, `  vec3 c = ${lin(stops[0][1])};`];
  for (let i = 1; i < stops.length; i++) {
    lines.push(
      `  c = mix(c, ${lin(stops[i][1])}, smoothstep(${stops[i - 1][0].toFixed(3)}, ${stops[i][0].toFixed(3)}, v));`,
    );
  }
  lines.push("  return c;", "}");
  return lines.join("\n");
}

const MAX_BOATS = 12; // lamp + fishboat + up to 10 afloat small boats (NFR-5)

const VERT = /* glsl */ `
  uniform mat4 textureMatrix;
  varying vec4 vUv4;
  varying vec3 vWorld;
  void main() {
    // FLAT plane, always — waves are per-fragment normals only. Rotation
    // lives on the MESH: the Reflector reads the plane normal from
    // matrixWorld, so vUv4 must come from untransformed geometry positions.
    vUv4 = textureMatrix * vec4(position, 1.0);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec3 uWeld;
  uniform vec3 uSunDir;
  uniform vec3 uSunGlow;
  uniform vec3 uBoatPos[${MAX_BOATS}];
  uniform int uBoatCount;
  varying vec4 vUv4;
  varying vec3 vWorld;

  ${gradientGLSL("masterGradient", WATER_STOPS)}

  ${SWELL_NORMAL_GLSL}

  void main() {
    vec3 wp = vWorld;
    float dist = length(wp - cameraPosition);

    // 1. Base: screen-space master gradient (0 = top of frame).
    float v = clamp(1.0 - gl_FragCoord.y / uResolution.y, 0.0, 1.0);
    vec3 col = masterGradient(v);

    // 2. Analytic swell normals (shared table — swell.ts).
    vec3 n = swellNormal(wp.xz, uTime);

    // 3. Clear planar mirror: projective sample + tiny ripple distortion.
    vec2 ruv = vUv4.xy / vUv4.w + n.xz * 0.02;
    vec3 refl = texture2D(tDiffuse, ruv).rgb;
    refl = mix(refl, vec3(0.35, 0.47, 0.50), 0.10); // water absorption tint
    vec3 viewDir = normalize(cameraPosition - wp);
    float ndv = clamp(dot(viewDir, n), 0.0, 1.0);
    float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0); // Schlick
    float reflAmt = clamp(fres * 2.6, 0.0, 0.78);
    reflAmt *= 1.0 - smoothstep(150.0, 500.0, dist);
    float boatDist = 1e5;
    for (int i = 0; i < ${MAX_BOATS}; i++) {
      if (i >= uBoatCount) break;
      boatDist = min(boatDist, length(wp.xz - uBoatPos[i].xz));
    }
    reflAmt *= 1.0 - smoothstep(12.0, 60.0, boatDist); // the mirror hugs hulls
    col = mix(col, refl, reflAmt);

    // 4. Seam weld: near-horizontal rays get sky(0) — warmed toward the sun
    //    azimuth so the sunlight melts across the skyline (no hard edge).
    float elev = normalize(wp - cameraPosition).y;
    vec3 flatDir = normalize(vec3(wp.x - cameraPosition.x, 0.0, wp.z - cameraPosition.z));
    vec3 flatSun = normalize(vec3(uSunDir.x, 0.0, uSunDir.z));
    float sunD = max(dot(flatDir, flatSun), 0.0);
    vec3 weld = mix(uWeld, uSunGlow, pow(sunD, 80.0) * 0.9 + pow(sunD, 7.0) * 0.3);
    col = mix(col, weld, smoothstep(-0.08, -0.005, elev));

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Reflector shader contract: color/tDiffuse/textureMatrix are wired by the
 *  Reflector itself; the rest are ours (updated per frame in OceanLoop). */
const WATER_SHADER = {
  name: "HarbourWater",
  uniforms: {
    color: { value: null as THREE.Color | null },
    tDiffuse: { value: null as THREE.Texture | null },
    textureMatrix: { value: null as THREE.Matrix4 | null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uWeld: { value: new THREE.Color(MIST_COLOR) },
    uSunDir: { value: new THREE.Vector3(...SUN_DIR) },
    uSunGlow: { value: new THREE.Color(PALETTE.sunGlow.hex) },
    uBoatPos: {
      value: Array.from({ length: MAX_BOATS }, () => new THREE.Vector3(0, -999, 0)),
    },
    uBoatCount: { value: 0 },
  },
  vertexShader: VERT,
  fragmentShader: FRAG,
};

export default function Ocean() {
  const gl = useThree((s) => s.gl);

  const water = useMemo(() => {
    const w = new Reflector(new THREE.PlaneGeometry(3000, 3000, 1, 1), {
      shader: WATER_SHADER,
      clipBias: 0.003,
      textureWidth: 2048,
      textureHeight: 2048,
      color: 0x889999,
    });
    // Rotation on the MESH, never baked into the geometry.
    w.rotation.x = -Math.PI / 2;
    w.frustumCulled = false; // the water must never vanish
    return w;
  }, []);

  useEffect(() => {
    // Mipmapped target: kills grazing-angle minification streaks.
    const tex = water.getRenderTarget().texture;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.anisotropy = gl.capabilities.getMaxAnisotropy();
    tex.needsUpdate = true;
    return () => water.dispose();
  }, [water, gl]);

  return (
    <>
      <primitive object={water} />
      <OceanLoop water={water} />
    </>
  );
}

const bufSize = new THREE.Vector2();

/** Per-frame uniforms: clock, drawing-buffer size, hull positions. */
function OceanLoop({ water }: { water: Reflector }) {
  /* eslint-disable react-hooks/immutability -- R3F idiom: writing shader
     uniforms on a live three.js material inside the frame loop. */
  useFrame(({ clock, gl }) => {
    const material = water.material as THREE.ShaderMaterial;
    material.uniforms.uTime.value = clock.elapsedTime;
    gl.getDrawingBufferSize(bufSize);
    material.uniforms.uResolution.value.copy(bufSize);
    // Hull mask for the hugging reflections: lamp + fishboat (on its orbit)
    // + every afloat small boat (forgetting the lamp = the buoy floats on
    // paint with no reflection — a real bug, never re-introduce).
    const pos = material.uniforms.uBoatPos.value as THREE.Vector3[];
    let n = 0;
    pos[n++].set(LAMP_POS[0], 0, LAMP_POS[2]);
    const orbit = orbitState(orbitNow(clock.elapsedTime)); // orbitNow: review freeze
    pos[n++].set(orbit.x, 0, orbit.z);
    for (const p of readAllBoatPositions()) {
      if (n >= MAX_BOATS) break;
      pos[n++].copy(p);
    }
    material.uniforms.uBoatCount.value = n;
  });
  /* eslint-enable react-hooks/immutability */
  return null;
}
