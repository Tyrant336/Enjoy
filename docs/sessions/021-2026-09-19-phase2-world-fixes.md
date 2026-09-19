# Session 021 — Phase 2 world fixes (Agent T): endline killed for real, reflections un-occluded, chrome split

> Agent T (3D world). Continuation of the Phase 2 queue + monitor's fix list
> (rulings from the monitor message that opened this session). Previous state:
> handoff `docs/handoff/agent-T.md`, sessions 012/018.

## Goal

Monitor queue, in order: (1) implement `worldStore.syncFromWorldState` (added to
the frozen worldApi by commit 09fcee9 — tsc was red without it), (2) kill the
horizon endline FOR REAL with pixel-scan proof, (3) make reflections visible
(occlusion fix) with close-range proof, (4) strip tour-offer/Skip-tour/error
banner from WorldOverlays (L's TourUI/Banners own them — one path, §3),
(5) fix label-pill overlap near the lamp, (6) green gates + evidence + this file.

## What was done (all verified by execution — evidence below)

1. **`worldStore.syncFromWorldState(state)`** (was already implemented in the
   previous turn of this session, before the monitor message arrived): absolute
   rebuild of the 3D projection from canonical `WorldState` — decks → boats
   (circle/docked/reviewing, preserving local animNonce/leader/baseAngle for
   surviving decks), reviewing state (FR-2.9 resume; unchanged review = no-op),
   lampGlowLevel (no victory pulse on rebuild), user labels/reducedMotion,
   pendingTour → tourOfferId. Loud on malformed state (throws). Idempotent by
   construction. `npx tsc --noEmit` green.
2. **Endline root-caused and killed.** Pixel probes (`.labshots/dump-col.ps1`)
   proved the bright rim (peak rgb(203,233,234) vs horizon (152,208,210)) came
   from the OCEAN's scene-fog path: the ShaderMaterial's `fogColor` uniform was
   not refreshed by the renderer, so the far field fogged toward the
   UniformsLib default WHITE. Fix (one mechanism, one path): the ocean no longer
   uses scene fog at all — its shader converges to `MIST_COLOR` by 420 u and IS
   its own distance fog (`Ocean.tsx`: fog includes + UniformsLib.fog removed;
   sheen now dies by 140 u so nothing outshines the mist). SkyDome: haze band
   moved up (peaks h≈0.13, gone by h≈0.05) and the sky converges to EXACTLY
   MIST_COLOR at h→0 with zero slope. Scene fog remains for near-field props.
3. **Reflections un-occluded** (`modelUtils.makeReflection`): the mirrored clone
   hangs below the OPAQUE ocean whose depth buffer culled every fragment →
   reflections were invisible. Now `depthTest: false` (+ existing
   `depthWrite: false`, transparent pass) and a grazing-angle fade in the shader
   (`pow(1-|viewY|, 1.5)`) so the §2.6 top-down view shows no mirrored smudges.
   Known, accepted tradeoff (documented): a nearer boat's hull no longer culls a
   far reflection — visible only as a faint veil in rare overlaps.
4. **WorldOverlays stripped** (one path, §3): tour-offer prompt, Skip-tour
   button, and the error banner deleted (not commented). Kept: notice pill +
   Return-to-harbour. `worldStore.worldError`/`tourOfferId` remain as the world
   projection slots written by the frozen worldApi; the lab sandbox (scratch,
   deleted before demo) renders them in its own chrome so lab evidence still
   surfaces errors/offers. `HostHandlers.onAcceptTour/onDismissTour` kept — L's
   `hostWiring.ts` registers them (deleting would break his compile).
5. **Pill overlap near the lamp**: docked boats carry their pill at y=1.45,
   circling boats at y=2.0 — the passing fleet no longer stacks two pills into
   one click target (visible in fx-01 / rv-14).
6. **Review-POV camera fight fixed** (found while re-verifying): camera-controls'
   `update()` writes `camera.position`/`lookAt` EVERY frame even when disabled,
   so the previous manual lerp was overwritten and the POV stayed ~27 u out
   (grade row bunched). Now the POV pose goes THROUGH camera-controls
   (`setLookAt` tween, smoothTime 0.45 ≈ 1.8 s settle, NFR-1 ≥1500 ms), input
   disabled while reviewing, gentle bob rides `setFocalOffset` (cleared on
   exit). POV pose moved to the stern corner (-1.9 fwd, +0.55 starboard, y=1.6)
   so the mast doesn't block the card boat. The reviewing boat's own reflection
   is suppressed while in POV (would smear the deck).
7. **Tooling**: `.labshots/` now has its own `node_modules` (puppeteer-core) —
   frontend's `--no-save` copy was pruned twice by other agents' `npm install`.
   All drivers repointed. New tools: `scan-horizon.ps1` (per-row median
   luminance step), `scan-profile.ps1`, `dump-col.ps1`, `probe-shot.mjs`,
   `fix-shots.mjs`, `fps-probe.mjs`.

## Verified-by-execution evidence (.labshots/)

- **Horizon pixel scans** (scan-horizon.ps1, per-row median luminance, rejects
  boats): fx-01 overview max adjacent-row step **2/255** (was 14+14 with a +28
  lum spike to 224); fx-02 topdown **3/255**; fx-04 lamp **2/255**; fx-03
  fishboat: no step >7 near the horizon (the y=599 step=80 is the fishboat hull
  dominating that row's median — boat geometry, not the horizon).
  Raw strip (dump-col.ps1, x=1200): rows y=386–398 all rgb(152,208,210)±1 —
  dither only, zero luminance step at the waterline.
- **Reflections**: fx-01 (fleet+lamp+fishboat reflections), fx-05 close-up
  (crisp at waterline, elongated ~1.22×, fading with depth), rv-08/rv-19 (lamp
  reflection incl. lantern glow). fx-06 over-zoomed into the lamp geometry —
  not used as proof.
- **Review loop re-run end-to-end** (review-shots.mjs, rv-01..20): question →
  reveal → 4 labelled grade boats (1·Again soft amber … 4·Easy, left→right) →
  grade → sink → rise ×2 (card 2/3 text asserted in DOM) → completion notice +
  dock + glow 0.50 ✓; Esc mid-deck notice ✓; keyboard-only 3-card run
  (Tab→Enter open, Tab→Enter reveal, keys 2/3/4 grade) ✓; reduced-motion
  variants (instant cut, fades) ✓; ×2 idempotency probes ✓; nothing-due
  message ✓. No PAGE ERROR anywhere.
- **No-red scan** (hue 345°–15°, sat>0.15): **0/144000 on ALL 27 new shots**
  (fx-01..06, probe-fixed, rv-01..20).
- **Gates**: `npm run build` ✓ (exit 0), `npx tsc --noEmit` ✓, `npm run lint` ✓
  (0 errors 0 warnings). **fps**: 60.1 over 4 s in the harbour (4 boats).

## Deviations / notes

- Drivers click world pills via DOM dispatch, not OS-level mouse — the pills
  are React DOM (drei Html); this drives the exact same handlers. The earlier
  real-mouse misses were pill overlap (fixed, item 5), not handler bugs.
- `worldError` production surfacing relies on L's Banners via worldBus onError;
  the world store slot is rendered only by the lab chrome. World-internal error
  calls (ReviewMode no-host, CameraRig missing runtime) are lab-only scenarios.
- Tour camera runner not re-verified this session (L's TourUI owns the chrome
  now; the world's runner code path is unchanged except comments).

## NOT verified (plainly)

- The exact three.js-internal reason the ShaderMaterial fogColor uniform stayed
  white (fix removes that path by design; not chased further).
- Production `app/page.tsx` integration with L's TourUI/Banners (not my zone).
- fx-03's y=599 step is asserted to be the hull by visual inspection, not by a
  second metric.

## State at end of session

All six monitor tasks complete. World layer: endline-free horizon, visible
grazing reflections, working review POV + keyboard/reduced-motion/idempotency
evidence, chrome split per §3. Gates green. Dev server on :3000 (not managed by
this agent). HANDOFF-READY.
