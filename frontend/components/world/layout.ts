/**
 * layout.ts — world-space layout constants for the harbour scene.
 * Composition locked to the local visual spec (gitignored):
 * water-level camera, horizon near vertical center, fishboat protagonist
 * near center, lamp balancing on the opposite third, generous negative space.
 */

import { PALETTE } from "@/lib/theme";

export const WATER_LEVEL = 0;

/** Sun azimuth ≈ −43° — dead ahead of the Today follow framing, low over the
 *  horizon so its warm glow rides the skyline in frame. Shared by the sky
 *  dome and the ocean's seam weld (one sun, one path). Pre-normalized. */
export const SUN_DIR: readonly [number, number, number] = [0.7308, 0.05, -0.6807];

/** Lamp buoy: the fixed center of the world — the flotilla orbits it. */
export const LAMP_POS: readonly [number, number, number] = [-10.5, 0, -10];

/**
 * Flotilla orbit (FR-2.4): the fishboat LEADS and the afloat small boats
 * follow in a staggered pile astern, the whole flotilla circling the lamp in
 * a wide, slow ring (NFR-1: full circle in 140 s).
 */
export const FLEET_CIRCLE = {
  center: [LAMP_POS[0], 0, LAMP_POS[2]] as readonly [number, number, number],
  radius: 180,
  /** Full circle in 140 s — a vast slow ring; the lamp stays far away. */
  angularSpeed: (Math.PI * 2) / 140,
};

/**
 * The flotilla frame at time t: position on the ring and the frame heading.
 * `frameYaw` is the rotation.y that points a +x-bow model along the direction
 * of travel (boats point where they sail — no sideways drifting).
 */
export function orbitState(t: number): { a: number; x: number; z: number; frameYaw: number } {
  const a = t * FLEET_CIRCLE.angularSpeed;
  return {
    a,
    x: FLEET_CIRCLE.center[0] + Math.cos(a) * FLEET_CIRCLE.radius,
    z: FLEET_CIRCLE.center[2] + Math.sin(a) * FLEET_CIRCLE.radius,
    frameYaw: -a - Math.PI / 2,
  };
}

/** Fishboat spawn/first-frame position (t=0 on the ring). */
export const FISHBOAT_POS: readonly [number, number, number] = [
  FLEET_CIRCLE.center[0] + FLEET_CIRCLE.radius,
  0,
  FLEET_CIRCLE.center[2],
];

/**
 * Staggered pile slots astern of the fishboat, in the flotilla frame
 * (x astern of the tug, z lateral): alternating sides, growing rows,
 * deterministic jitter — a jumble of boats following home, never a grid.
 */
export function pileSlot(index: number): { x: number; z: number } {
  // Duckling line DERIVED FROM FOLLOW_OFFSET (do NOT hardcode a corridor —
  // the follow camera lives at FOLLOW_OFFSET in frame space, so the pile
  // trails TOWARD it: every boat sits between camera and fishboat, in frame,
  // never occluded, visibly following its lead. Lateral clearance keeps the
  // labels from stacking. Works for any FOLLOW_OFFSET.
  const fl = Math.hypot(FOLLOW_OFFSET[0], FOLLOW_OFFSET[2]);
  const cx = FOLLOW_OFFSET[0] / fl; // unit direction fishboat → camera
  const cz = FOLLOW_OFFSET[2] / fl;
  const d = 16 + index * 7; // toward the camera (astern of the fishboat)
  // Perpendicular sightline clearance: ≥11 u or the boat sits INSIDE the
  // tug's silhouette from the follow camera (atan(5/148) ≈ 1.9° < the tug's
  // ≈2.8° beam — the "small boat blocked by the big boat" report, session 032).
  const w = 11 + index * 3;
  return {
    x: cx * d - cz * w + Math.sin(index * 12.9898) * 0.7,
    z: cz * d + cx * w + Math.cos(index * 7.233) * 0.7,
  };
}

/** Finished decks rest docked beside the lamp (FR-2.4/§2.5). Slots fan out
 *  around the lamp so multiple completed decks never overlap. */
export function dockSlotPos(index: number): readonly [number, number, number] {
  const a = 0.5 + index * 0.85;
  const r = 10 + Math.floor(index / 4) * 3;
  return [LAMP_POS[0] + Math.cos(a) * r, 0, LAMP_POS[2] + Math.sin(a) * r];
}

/** Small boats are 6.4 u long — a fifth of the 32 u fishboat (2× the
 *  original 3.2 u: clearly readable next to the tug, owner decision
 *  session 032). Pile/dock spacing above is scaled to match. */
export const SMALLBOAT_LENGTH = 6.4;
// §2.3.2 leader scale override (owner decision session 032): all small boats
// are one size — the leader is marked by its soft purple sail tint only.

/** Approved sail tints (§2.4: purple/sage/grey-blue only — never red). */
export const SAIL_TINTS = {
  purple: PALETTE.sailPurple.hex,
  sage: PALETTE.sailSage.hex,
  blueGrey: PALETTE.sailBlueGrey.hex,
} as const;

/**
 * The follow framing (Today / overview — one path, §3): the camera rides
 * behind-above the fishboat, tug dead center, the pile of small boats
 * trailing in frame. Recomputed per request/per frame because the flotilla
 * orbits the lamp (the offset rotates with the flotilla's heading).
 */
// The camera rides ASTERN of the flotilla (ahead-above put the whole
// trailing fleet off-frame left — owner feedback 2026-09-20): the fishboat
// leads away from us, its duckling fleet visibly following toward the
// viewer — the reference composition (Background/Screenshot …220556.png).
const FOLLOW_OFFSET = [-116, 56, 118] as const;
const FOLLOW_TARGET_LIFT = 2.5;

export function followPose(t: number): { pos: [number, number, number]; target: [number, number, number] } {
  const o = orbitState(t);
  const c = Math.cos(o.frameYaw);
  const s = Math.sin(o.frameYaw);
  // Rotate the offset about Y by frameYaw: x' = x·c + z·s, z' = −x·s + z·c.
  const ox = FOLLOW_OFFSET[0] * c + FOLLOW_OFFSET[2] * s;
  const oz = -FOLLOW_OFFSET[0] * s + FOLLOW_OFFSET[2] * c;
  return {
    pos: [o.x + ox, FOLLOW_OFFSET[1], o.z + oz],
    target: [o.x, FOLLOW_TARGET_LIFT, o.z],
  };
}

/**
 * Camera presets (worldApi/tour targets, §5.3 camera_fly_to + §2.6 anchor
 * perspectives). §2.6: free-look orbit everywhere; three anchor perspectives
 * (top-down / fishboat-centric / lamp-centric); the DEFAULT overview is the
 * follow framing on the orbiting fishboat (followPose — one definition).
 */
export const CAMERA_PRESETS = {
  /** Default load view — the follow framing at t=0 (initial camera before
   *  CameraRig's first-frame follow takes over). */
  overview: followPose(0),
  /** §2.6.1 top-down: high AERIAL map centered on the lamp. Not a literal
   *  straight-down: from directly above the lamp/boats collapse to their
   *  footprints (~25 px dots) and hide UNDER their label pills — the map
   *  read as empty. 46° elevation keeps every silhouette readable; the
   *  target is biased 30 u toward the camera so the foreshortened NEAR
   *  side of the R=180 ring stays inside the 20° vertical half-fov
   *  (a centered target crops the flotilla at the frame bottom twice per
   *  orbit — the map's whole point is finding your boats). */
  topdown: { pos: [LAMP_POS[0], 300, LAMP_POS[2] + 320], target: [LAMP_POS[0], 1, LAMP_POS[2] + 30] },
  /** §2.6.2 fishboat-centric ("Today"): the same follow view as overview. */
  fishboat: followPose(0),
  /** The fleet ring around the lamp (whole R=180 circle in frame: the ring
   *  subtends asin(R/d) ≈ 26°, comfortably inside the 33° horizontal
   *  half-fov at d ≈ 417). */
  fleet: { pos: [LAMP_POS[0] + 110, 130, LAMP_POS[2] + 380], target: [LAMP_POS[0], 1, LAMP_POS[2]] },
  /** §2.6.3 lamp-centric: full buoy in frame. The camera sits INSIDE the
   *  flotilla ring (R=180) — the orbiting tug never comes near the buoy. */
  lamp: { pos: [LAMP_POS[0], 24, LAMP_POS[2] + 68], target: [LAMP_POS[0], 15, LAMP_POS[2]] },
  /** Dive: descend toward the water, never below it (§7.4 motion-sickness safe). */
  underwater: { pos: [0, 0.55, 11], target: [0, -1.5, -6] },
  /** Review POV placeholder (the live POV is computed from the deck boat in
   *  CameraRig). Kept inside the orbit limits so a bare preset request can
   *  never be silently clamped. */
  review: { pos: [-1, 4.5, 2], target: [-10.5, 1.6, -10] },
} as const satisfies Record<
  string,
  { pos: readonly number[]; target: readonly number[] }
>;
