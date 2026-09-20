# Session 027 — Bright-day scene grade for the 3D world

- Date: 2026-09-19
- Scope: frontend 3D scene only (`components/world/`, `lib/theme.ts` palette
  additions). DOM chrome untouched (session 023 owns it). `lib/types.ts` and
  the worldApi contract remain FROZEN.

## Goal

Regrade the harbour scene to the **bright-day grade**: one continuous
aqua gradient sky→sea with no horizon seam, a two-light toon rig with
clearly readable sunlit/shadow sides, white puffy clouds, deeper turquoise
water with hull-hugging reflections, a farther 40° camera, and a wide slow
fleet orbit with organic wander.

## What was done

1. **Lighting rig** (`HarbourCanvas.tsx`) — hemisphere `#CDDFDF`/`#2A5A66`
   ×1.35, fixed warm key `#FFEFD2` ×1.9 at (−35, 80, 25), mauve fill
   `#A97E88` ×0.55 at (30, 18, −28). Flat ambient removed. No shadow maps —
   grounding is the reflection. NoToneMapping + sRGB output kept.
2. **Toon ramp** (`modelUtils.ts`) — shared 4-step gradient map
   `[90, 150, 210, 255]` (was 3-step `[120, 190, 255]`): deeper shade band,
   crisper toon read.
3. **Sky** (`SkyDome.tsx`) — world-space elevation gradient (h = dir.y;
   screen-space flips inside the mirror), stops 0.00 `#A4D5D7` → 0.22
   `#B7DDDE`; zenith lift toward (0.94, 0.98, 0.98); painterly white puffy
   clouds (4-octave value-noise fbm, shadow `#E2F3F3` / bright `#F8FCFB`,
   whisper of fog haze).
4. **Water** (`Ocean.tsx`) — bright-day master gradient (screen-space,
   smoothstep stops, hue locked ~182°, deep zone glows turquoise `#009CA2`
   instead of going dark); fresnel reflections (Schlick, clamp ×2.6 → 0.78)
   that fade with distance and hug hulls via per-frame boat positions (lamp
   + fishboat + every afloat boat); horizon seam weld to sky(0) `#A4D5D7`;
   analytic swell normals from the shared wave table. No sparkle/glow.
5. **Fog & clear color** — `Fog(#D9EDED, 120, 1400)`; background
   `#A4D5D7`. Sky/water shaders ignore fog by construction.
6. **Camera** (`HarbourCanvas.tsx`, `CameraRig.tsx`, `layout.ts`) — vfov 40°,
   near 0.1 / far 5000; minDistance 14 / maxDistance 700 (review POV relaxes
   to 0.5 / 0.75π while locked, restores after); presets reframed wider:
   Today rides off the fishboat's quarter, Global is a high map-like
   overhead, Lamp frames the full buoy.
7. **Fleet mechanics** (`Fleet.tsx`, `SmallBoat.tsx`, `Fishboat.tsx`,
   `boatRuntime.ts`, NEW `swell.ts`) — ONE shared wave table
   (dirs/amps/lens/speeds (1,.25,.16,30,.9), (−.6,1,.11,17,1.25),
   (.35,−1,.06,9,1.7)) driving both GPU normals and CPU bob; fishboat
   y = h − 0.15 with swell-gradient pitch/roll (e=1.2, ×0.7); small boats
   y = h·0.55 − 0.05 with gentle pitch. Fleet orbits the lamp at **R 18,
   period 140 s** (the reference 45-unit radius was scaled to the harbour's
   composition — wide enough to read as a grand slow circle, small enough to
   keep the fleet inside the overview frame); staggered pile slots with
   deterministic jitter (`sin(i·12.9898)`, `cos(i·7.233)`), golden-angle
   per-boat phase (i·2.399), heading wander, turn-rate-capped bow-first
   arcs (1.2 rad/s, bow axis +x).
8. **Outlines** (`modelUtils.ts`) — inverted-hull navy `#1A203B` widths
   verified: fishboat 0.10 / small boats 0.05 / lamp 0.06 world units,
   converted through each mesh's world scale.
9. **Palette** (`lib/theme.ts`) — new hue-guarded tokens for the grade
   (`fog`, `horizonWeld`, `hemiSky`, `hemiGround`, `keySun`, `fillMauve`,
   water gradient stops) — no hue in 345°–15°, all round-trip verified.

## Verification

- `tsc --noEmit` ✓ · `eslint` ✓ · vitest 35/35 ✓ · `next build` ✓
- Screenshot harness: `.labshots/port-01-overview.png`, `port-02-topdown.png`,
  `port-03-today.png`, `port-04-lamp.png` (via the TEMP `__world` probe in
  HarbourCanvas — removed before commit).

## Notes

- Orbit radius choice (18 vs reference 45) documented above; revisit if the
  composition's world scale ever changes.
- `window.__world` debug probe in `HarbourCanvas.tsx` is TEMP (screenshot
  harness) and must be removed before commit.
