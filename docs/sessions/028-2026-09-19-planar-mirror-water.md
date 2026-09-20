# 028 — 2026-09-19 — Planar-mirror water + flotilla orbit + subject grade

## Goal

Owner rejected the scene on five points: white-blob reflections, fishboat too
small, camera too close, static composition, and a pale/grey water grade. Fix
all five against the locked local visual spec (gitignored reference pack).

## What was done

### 1. Planar-mirror water (the big one)
- `Ocean.tsx` rewritten: the ocean is now three's `Reflector`
  (`three/examples/jsm/objects/Reflector.js` — verified identical in behavior
  to the vendored copy in the visual spec) with a custom water shader:
  screen-space bright-day master gradient (exact hex stops kept), analytic
  swell normals from the shared wave table (`swell.ts` stays the single
  source), projective mirror sample `ruv = vUv4.xy/vUv4.w + n.xz·0.02`,
  absorption tint `mix(refl, (0.35,0.47,0.50), 0.10)`, Schlick fresnel
  `0.02+0.98(1−N·V)^5`, `reflAmt = clamp(fres·2.6,0,0.78) · dist fade 60→200
  · hull-hug 6→26` (mask = lamp + fishboat + every afloat small boat,
  uploaded per frame), seam weld to `sky(0)`. No sparkle/glow. Ends with
  `colorspace_fragment`.
- Reflector setup: FLAT `PlaneGeometry(3000,3000,1,1)`, rotation on the MESH
  (`rotation.x = −π/2`), 2048² target + mipmaps + `LinearMipmapLinearFilter`
  + max anisotropy, clipBias 0.003. Renderer clear color already tracks the
  horizon weld `#A4D5D7` (HarbourCanvas) — below-clip region stays seamless.
- `modelUtils.makeReflection` (mirrored-geometry clones, scale.y ≈ −1.22) and
  its shaders DELETED, along with every usage (Fishboat/LampBuoy/SmallBoat/
  Fleet/ReviewMode) and the reflection branch of `setGroupOpacity`.
- Labels are DOM overlays (drei `Html`), never scene objects → they cannot
  leak into the mirror pass; no hide/restore dance needed.

### 2. World-unit normalization (`modelUtils.fitToWater(obj, length, draft)`)
- Fishboat: 12 u long, draft 1.0 (hull visibly floats).
- Lamp buoy: 4.5 u wide, draft 0.3 (fitToWater also centers the GLB; the old
  GLB_OFFSET_X correction is gone). Lantern light y = 6.2, pill at 10.2.
- Small boats: 3.2 u (leader 1.15×), draft 0.12. Review stage boats keep
  their previous visual size (grade 1.05 / card 1.2 u).
- Outline widths are now passed in world units and converted through the fit
  scale everywhere.

### 3. Camera (layout.ts + CameraRig.tsx)
- Today/overview = ONE follow view: `followPose(t)` = flotilla pos +
  (16, 8.5, 18) rotated by the flotilla heading, target flotilla + (0,2.5,0).
- Follow mode: after the fly-to lands, CameraRig adds the flotilla's
  per-frame orbit delta to the camera and re-pins the target each frame,
  until the user orbits (`controlstart`) or another preset is requested.
  camera-controls transition events gate the handoff; the previous flotilla
  position is refreshed every frame so tween/POV handbacks never jump.
- Global (topdown): static overhead centered on the lamp, y=120, z+8
  (gimbal-safe). Lamp view: lamp + (0,5.5,14) — INSIDE the flotilla ring
  (R=18): the specced ~21 u offset put the orbiting 12 u tug within ~3 u of
  the eye once per orbit and eclipsed the buoy (caught in a screenshot).
  minDistance relaxes to 3 in lamp view, 14 elsewhere; maxDistance 700,
  vfov 40 unchanged.

### 4. Flotilla orbit (layout.ts `orbitState`/`pileSlot`, Fleet.tsx, Fishboat.tsx)
- The fishboat LEADS: pos = lamp + (cos a·18, 0, sin a·18), a = t·2π/140,
  `rotation.y = frameYaw = −a − π/2`, rides the shared swell.
- Afloat small boats chase staggered pile slots astern of the tug in the
  orbiting flotilla frame (x = −8.5 − row·3.2 + jitter, z = side·(1.6 +
  row·1.1) + jitter, deterministic jitter), bow-first steering toward the
  slot (turn cap 1.2 rad/s), golden-angle wander `(sin(t·0.6+phase)·0.5 +
  sin(t·1.7+phase·2.3)·0.25) · min(1, d/6+0.15)`, phase = index·2.399,
  speed `clamp(d·0.9+0.6, 2.2, 5.5)`, dt clamped to 50 ms.
- Docked boats still moor at the lamp ring (`dockSlotPos`) — they do NOT
  orbit. Reviewing boats hold their live position (POV contract unchanged).
  `worldApi`/`lib/types.ts` untouched; `BoatEntry.baseAngle` removed (dead).
- Review POV distances rescaled for the 3.2 u deck boats (eye 5.2 astern +
  1.6 starboard at y 2.6). Labels track the moving flotilla (drei Html
  re-pins per frame; verified in screenshots).

### 5. Colour grade
- Fishboat GLB materials remapped by material NAME to the subject palette:
  Cream→#F7F1DE, Deck→#DFC1AF, Charcoal→#1A203B, GlassDark→#CDE4E8; mesh
  override `Hull→#1A203B` (hull shares the Cream material with the
  wheelhouse — material-name remap alone cannot split them). Unknown
  material name = throw (fail loudly). All hues outside 345°–15°.
- Water saturation: the pale read was the old shader's weld-tinted "mirror
  zone" standing in for real reflections; with the true mirror + absorption
  tint + untouched gradient stops the water matches the reference's
  saturated cyan-teal. Fog (#D9EDED 120–1400) only touches the toon props.

## Verification (executed, not assumed)

- `npx tsc --noEmit` clean; `npm run lint` 0/0; `npm run build` green;
  `vitest run` (components/ui/__tests__ config): 8 files, 35 tests pass.
- Dev server :3000 (was NOT running despite the task brief — started it
  with `npm run dev`; hot reload picked up every edit).
- Screenshots (driver `.labshots/fix2-shots.mjs`, `fix2-lab.mjs`,
  `fix2-review.mjs`; viewed and iterated):
  - `.labshots/fix2-01-home.png` — follow view: navy tug centered, real
    tinted mirror image under the hull, saturated teal water, pill in frame.
  - `.labshots/fix2-02-global.png` — y=120 overhead on the lamp.
  - `.labshots/fix2-03-lamp.png` — full buoy, glowing lantern, mirror
    reflection, no flotilla blocking.
  - `.labshots/fix2-04-today.png`, `fix2-10/11-lab-home*.png` — follow mode
    verified (bearing rotates with the orbit between shots, tug stays
    centered); pile astern + docked boat at the lamp.
  - `.labshots/fix2-20..24-*.png` — review POV open → reveal → grade →
    next card → Esc return all work with the new fleet motion.
- Provenance grep over every touched file: zero matches.

## Known observations / deviations

- Lamp camera moved from the suggested ~21 u to 14 u off the lamp (inside
  the orbit ring) — reason recorded above.
- During the first seconds of a review, pile-mate boats may still be near
  the frozen review boat; their slots keep orbiting so they sail clear on
  their own (no sail-out stage was added — the frozen-POV contract stays).
- Global view (y 120–150 band, owner-specced): subjects are small and sit
  close under their pills — matches the reference's global framing.
- Session docs 012/021/024 keep their historical text; the handoff
  (`docs/handoff/agent-T.md`) reflection bullet now points here.

## Follow-up (same day): wider Today framing

Owner feedback: the follow view sat too close (tug ≈31% of frame width).
`FOLLOW_OFFSET` (16, 8.5, 18) → **(30, 15, 32)** (≈46 u off the tug, same
elevation angle) — tug now ≈17% of frame width, lamp buoy shares the frame,
matching the target composition. Verified live at t=8 s and t=28 s: the
follow camera rides the orbit (bearing rotates, tug stays centered,
reflections stay glued to hulls). tsc/eslint/vitest/build all green.

## Follow-up 2 (same day): cream hull, wide R45 ring, larger models

Owner feedback: (a) the navy hull read as full black — hull now cream
`#F7F1DE`, trim/masts softened to slate-navy `#4E5D82` (never black);
(b) the fishboat must never come near the lamp — flotilla ring R 18 →
**45** (period stays 140 s, ≈2 u/s); (c) both models enlarged — fishboat
12 → **16 u** (draft 1.3, outline 0.13, pill y 13), lamp 4.5 → **6.5 u**
(draft 0.4, outline 0.09, lantern light y 9, pill y 14.5). Scaled with them:
follow offset (40, 20, 43), pile slots astern (−11.5 − row·3.2, side ±(2.0 +
row·1.1)), dock ring r 4.5 + 1.6/4 idx, topdown y 160, fleet view +25/28/+85,
lamp view (0, 10, +30 → target y 6). Verified live: follow framing t=8/28 s,
lamp view full buoy + reflection, global map view. tsc/eslint/vitest 35/35/
build all green.

## Follow-up 4 (same day): rotating-frame follow + doubled scale

Owner feedback: (a) Today view must RIDE the fishboat (screen moves with the
boat, boat dead center) — the delta-follow kept a fixed world bearing;
CameraRig follow now rotates the camera offset by the frame's per-frame yaw
delta around the boat + re-anchors to it (snap-free, world sweeps past);
(b) doubled scale — flotilla ring R 45 → **90**, fishboat 16 → **32 u**
(draft 2.0, outline 0.30, pill y 26), lamp 6.5 → **13 u** wide × **1.4
vertical stretch** (taller silhouette; draft 0.8, outline 0.20, lantern
light y 26, pill y 40, re-grounded waterline after stretch); pile slots,
dock ring, topdown (y 220), fleet and lamp (0, 24, +68 → target y 15)
presets rescaled; (c) ocean reflection reach rescaled for the far framing
(distance fade smoothstep(150, 500), hull hug smoothstep(12, 60)) — the
mirror now hugs hulls at follow distance, grounding the boat at the
waterline. Verified: fix9 follow proof (t=0/25/50 s, boat centered
throughout), lamp/global shots, tsc/eslint/vitest 35/35/build green.
NOTE: the dev server was restarted this session — stale browser tabs must be
hard-refreshed (Ctrl+Shift+R) to pick up the follow fix.

## Follow-up 5 (same day): follow feel corrected

The rotating-frame follow (follow-up 4) locked boat+lamp+horizon rigidly on
screen — it FELT static. Reverted to translation-delta follow (the camera
sails with the fishboat, keeps its own bearing, target re-pinned to the
tug): the boat visibly TURNS in frame and the lamp/sun sweep past over each
orbit, tug always dead center (fix9-t00 vs t50 proof). Gates green.
