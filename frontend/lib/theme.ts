/**
 * theme.ts — the LOCKED palette for the "enjoy" harbour world.
 *
 * Sources:
 *  - docs/REQUIREMENTS.md §2.2 (palette, locked tokens)
 *  - local visual spec, gitignored (measured hex values)
 *  - docs/REQUIREMENTS.md FR-3.6 (underwater cluster colors: HSL L 60–75,
 *    S 60–90, hues ≥40° apart, none inside the red range 345°–15°)
 *
 * HARD RULE (REQUIREMENTS §2.1 / NFR-2): no authored color may have a
 * normalized hue in 345°–15° (red). Automated tests enforce this — every
 * token below carries its HSL triple so the rule is auditable by eye.
 */

/** HSL triple in degrees / percent / percent. */
export type Hsl = readonly [h: number, s: number, l: number];

/** Convert an HSL triple to a `#rrggbb` hex string (sRGB). */
export function hslToHex([h, s, l]: Hsl): string {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) =>
    ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to2 = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to2(f(0))}${to2(f(8))}${to2(f(4))}`;
}

/** Normalized hue (0–360). True if the hue lies in the forbidden red range. */
export function isForbiddenRed(hue: number): boolean {
  const h = ((hue % 360) + 360) % 360;
  return h >= 345 || h <= 15;
}

type Token = { hsl: Hsl; hex: string };

function token(h: number, s: number, l: number): Token {
  if (isForbiddenRed(h)) {
    // Fail loudly at module load — a red token must never ship (NFR-2).
    throw new Error(`theme: hue ${h} is inside the forbidden red range 345°–15°`);
  }
  const hsl = [h, s, l] as const;
  return { hsl, hex: hslToHex(hsl) };
}

/**
 * Above-water palette — hexes from the locked local visual spec;
 * HSL triples derived from those hexes.
 */
export const PALETTE = {
  /** Sky top — pale cyan `#BADEE0` (183°, 17%, 88%). */
  skyTop: token(183, 27, 81),
  /** Sky mid — almost-white mist `#C1E1E2` (182°, 15%, 89%). */
  skyMid: token(182, 23, 82),
  /** Sky just above horizon / fog `#9AD0D2` (182°, 27%, 82%). */
  horizon: token(182, 39, 71),
  /** Warm-white mist band & label pill fill `#EDEDDD` (60°, 7%, 93%). */
  mist: token(60, 29, 90),
  /** Water at horizon `#8DC9CC` (183°, 31%, 80%). */
  waterFar: token(183, 35, 68),
  /** Upper-water sheen band `#A1D0D2` (182°, 23%, 82%). */
  waterSheen: token(182, 34, 73),
  /** Mid water `#2EA7AD` (183°, 73%, 68%). */
  waterMid: token(183, 58, 43),
  /** Bottom-of-frame saturated teal `#009CA2` (182°, 100%, 64%). */
  waterDeep: token(182, 100, 32),
  /** The one dark ink — outlines, text, mast `#1A203B` (229°, 56%, 23%). */
  ink: token(229, 40, 17),
  /** Ink at its darkest (waterline contact) `#0F1222` (231°, 56%, 13%). */
  inkDeep: token(231, 39, 9),
  /** Fishboat hull cream `#C2B79C` (43°, 20%, 76%). */
  hullCream: token(43, 24, 69),
  /** Lamp buoy weathered body `#919676` (69°, 21%, 59%). */
  buoyBody: token(69, 14, 53),
  /** Grey-blue cabin/chimney `#808F98` (202°, 16%, 60%). */
  greyBlue: token(202, 10, 55),
  /** Lantern glow core `#FFFFC2` (60°, 24%, 100%) — the only warm light. */
  lanternGlow: token(60, 100, 88),
  /** Reflection tint (object color dragged toward water) `#77AAAE`. */
  reflectionTint: token(184, 25, 57),
  /** Sail: dusty soft purple `#928699` (280°, 11%, 59%). */
  sailPurple: token(280, 11, 56),
  /** Sail: soft sage green `#8BAEA8` (170°, 20%, 68%). */
  sailSage: token(170, 21, 61),
  /** Sail: soft grey-blue `#A3D1D3` (182°, 23%, 83%). */
  sailBlueGrey: token(182, 34, 73),
  /** Soft amber — warnings / "Again" grade / errors (never red). */
  softAmber: token(38, 78, 62),

  /* ── Underwater (REQUIREMENTS §2.2: deep teal/cyan, dark, additive) ── */
  /** Underwater deep background — dark teal. */
  abyssDeep: token(191, 72, 10),
  /** Underwater mid water column. */
  abyssMid: token(188, 66, 22),
  /** Underwater upper column (light from the surface). */
  abyssTop: token(186, 58, 38),
  /** Underwater seafloor — muted deep teal (no warm sand in the dark theme). */
  abyssFloor: token(189, 45, 18),
} as const;

/**
 * Atlas cluster palette (FR-3.6, LOCKED): bright self-luminous tones for the
 * dark additive underwater scene. L 60–75, S 60–90, hues pairwise ≥40° apart,
 * none in 345°–15°. Assigned to clusters in this fixed order by the adapter
 * (frontend/lib/atlas/atlasAdapter.ts).
 *
 * Hues: 182 teal · 48 amber-yellow · 272 purple · 140 green · 222 blue · 320 magenta-free pink-violet
 * Pairwise min gap = 40° (182↔222, 182↔140). 320 is outside the red range.
 */
export const CLUSTER_PALETTE: readonly Token[] = [
  token(182, 78, 66),
  token(48, 85, 64),
  token(272, 72, 70),
  token(140, 62, 62),
  token(222, 80, 70),
  token(320, 60, 68),
];

/** Label pill styling constants (docs/LABELS.md + locked visual spec). */
export const LABEL = {
  fill: PALETTE.mist.hex,
  text: PALETTE.ink.hex,
  shadow: "0 3px 14px rgba(15, 18, 34, 0.18)",
} as const;

/** Comfort motion (NFR-1). */
export const MOTION = {
  /** Camera transitions / mode changes: ≥1500 ms. */
  cameraMs: 1800,
  /** Dive/surface overlay fade: ≥1500 ms. */
  diveMs: 1600,
  /** Local feedback (label fades, glow changes): 700–1200 ms. */
  localMs: 900,
  ease: "cubic-bezier(.22, .7, .2, 1)",
} as const;
