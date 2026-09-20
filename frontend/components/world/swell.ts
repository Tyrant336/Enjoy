/**
 * swell.ts — the ONE calm-swell wave table for the harbour. The GPU water
 * normals (Ocean.tsx) and the CPU boat bobbing (Fleet.tsx / Fishboat.tsx)
 * share these exact constants — one source, never duplicated (AGENTS §3.1).
 *
 * Waves exist ONLY as per-fragment analytic normals + gentle CPU bob: the
 * ocean geometry stays FLAT (vertex displacement smears the mirrored
 * reflections and reads as chop, not calm).
 */

export type SwellWave = {
  /** Unit direction of travel on the XZ plane. */
  dx: number;
  dz: number;
  /** Amplitude (world units). */
  amp: number;
  /** Wavelength (world units). */
  len: number;
  /** Phase speed (rad/s). */
  speed: number;
};

/** (dirX, dirZ, amp, len, speed) — dirs normalized below. */
const RAW_WAVES: readonly (readonly [number, number, number, number, number])[] = [
  [1.0, 0.25, 0.16, 30.0, 0.9],
  [-0.6, 1.0, 0.11, 17.0, 1.25],
  [0.35, -1.0, 0.06, 9.0, 1.7],
];

export const SWELL_WAVES: readonly SwellWave[] = RAW_WAVES.map(
  ([x, z, amp, len, speed]) => {
    const l = Math.hypot(x, z);
    return { dx: x / l, dz: z / l, amp, len, speed };
  },
);

/** CPU swell height: Σ amp·sin(k·(d·(x,z)) − speed·t), k = 2π/len. */
export function swellHeight(x: number, z: number, t: number): number {
  let h = 0;
  for (const w of SWELL_WAVES) {
    const k = (Math.PI * 2) / w.len;
    h += w.amp * Math.sin(k * (w.dx * x + w.dz * z) - w.speed * t);
  }
  return h;
}

const f = (n: number, digits = 6): string => n.toFixed(digits);

/**
 * GLSL twin of the table above: analytic swell normal at world point `wp`
 * (start from straight up, subtract dir·(amp·k·cos(k·dot(dir,wp)−speed·t))
 * per wave, normalize). Generated FROM SWELL_WAVES so GPU and CPU can never
 * drift apart.
 */
export const SWELL_NORMAL_GLSL = /* glsl */ `
  vec3 swellNormal(vec2 wp, float t) {
    vec3 n = vec3(0.0, 1.0, 0.0);
${SWELL_WAVES.map(
  (w) => `    {
      float k = ${f((Math.PI * 2) / w.len)};
      vec2 d = vec2(${f(w.dx)}, ${f(w.dz)});
      n.xz -= d * (${f(w.amp, 3)} * k * cos(k * dot(d, wp) - ${f(w.speed, 3)} * t));
    }`,
).join("\n")}
    return normalize(n);
  }
`;
