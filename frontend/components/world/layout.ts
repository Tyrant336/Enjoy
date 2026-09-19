/**
 * layout.ts — world-space layout constants for the harbour scene.
 * Composition locked to the local visual spec (gitignored):
 * water-level camera, horizon near vertical center, fishboat protagonist
 * near center, lamp balancing on the opposite third, generous negative space.
 */

import { PALETTE } from "@/lib/theme";

export const WATER_LEVEL = 0;

/** Fishboat: the protagonist, near center (slightly right). */
export const FISHBOAT_POS: readonly [number, number, number] = [3, 0, -8];

/** Lamp buoy: counterweight on the left third, a touch farther out. */
export const LAMP_POS: readonly [number, number, number] = [-10.5, 0, -10];

/** Fleet circle (FR-2.4): due decks circle the lamp, passing behind the fishboat. */
export const FLEET_CIRCLE = {
  center: [LAMP_POS[0], 0, LAMP_POS[2]] as readonly [number, number, number],
  radius: 6.5,
  /** Full circle in ~2 minutes — slow, calm (NFR-1). */
  angularSpeed: (Math.PI * 2) / 120,
};

/** Finished decks rest docked beside the lamp (FR-2.4/§2.5). Slots fan out
 *  around the lamp so multiple completed decks never overlap. */
export function dockSlotPos(index: number): readonly [number, number, number] {
  const a = 0.5 + index * 0.85;
  const r = 3.1 + Math.floor(index / 4) * 1.4;
  return [LAMP_POS[0] + Math.cos(a) * r, 0, LAMP_POS[2] + Math.sin(a) * r];
}

/** Small boats are ~1/5 the fishboat's length (locked visual spec). */
export const SMALLBOAT_SCALE = 0.3;
export const LEADER_SCALE_MULT = 1.15; // §2.3.2 leader boat

/** Approved sail tints (§2.4: purple/sage/grey-blue only — never red). */
export const SAIL_TINTS = {
  purple: PALETTE.sailPurple.hex,
  sage: PALETTE.sailSage.hex,
  blueGrey: PALETTE.sailBlueGrey.hex,
} as const;

/**
 * Camera presets (worldApi/tour targets, §5.3 camera_fly_to + §2.6 anchor
 * perspectives). §2.6: free-look orbit everywhere; three anchor perspectives
 * (top-down / fishboat-centric / lamp-centric); the DEFAULT overview is the
 * cinematic near-water composition (horizon 42–52%, negative space) with a
 * slightly raised, oblique eye for real 3D depth (owner video review).
 */
export const CAMERA_PRESETS = {
  overview: { pos: [5.5, 2.4, 16], target: [-1.5, 1.0, -9] },
  /** §2.6.1 top-down: map-like, reveals the fleet circle and dock layout. */
  topdown: { pos: [-2.5, 38, -5], target: [-3, 0, -9.2] },
  /** §2.6.2 fishboat-centric: orbit anchored on the fishboat (schedule). */
  fishboat: { pos: [9.5, 3.2, -1.5], target: [3, 1.6, -8] },
  fleet: { pos: [-2.5, 3.2, 0], target: [-10.5, 1.2, -10] },
  /** §2.6.3 lamp-centric: orbit anchored on the lamp (journal + docks). */
  lamp: { pos: [-5.5, 3.0, -4], target: [-10.5, 2.0, -10] },
  /** Dive: descend toward the water, never below it (§7.4 motion-sickness safe). */
  underwater: { pos: [0, 0.55, 11], target: [0, -1.5, -6] },
  /** Review POV placeholder (the live POV is computed from the deck boat). */
  review: { pos: [-4, 1.4, -4], target: [-10.5, 1.0, -10] },
} as const satisfies Record<
  string,
  { pos: readonly number[]; target: readonly number[] }
>;
