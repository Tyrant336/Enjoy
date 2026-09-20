# Session 031 — Today-camera landing lead + fishboat↔lamp distance doubled

Date: 2026-09-20. Owner report: pressing **Today** left the boat off-center
(screenshot: boat at left edge); asked to double the fishboat↔lamp distance and
to confirm the small boats follow the fishboat.

## What was done

1. **Camera landing lead (`frontend/components/world/CameraRig.tsx`)**
   - Root cause: `flyTo` evaluated `followPose(t)` at click time, but the
     fishboat sails ≈4 u/s (ω·R) during the ≥1500 ms eased flight and the
     per-frame follow re-pin is parked until camera-controls fires `rest`.
     The camera therefore landed where the boat *was* (~7 u off), and the
     resume was an instant snap.
   - Fix (one line): follow presets now aim at
     `followPose(t + durationMs/1000)` — where the boat WILL be when the damp
     settles (≈4×smoothTime = durationMs). No state-machine changes.
   - Verified by execution (puppeteer, `.labshots/fix11-verify.mjs`): boat is
     dead center the moment the flight lands and 10 s later
     (`fix11-v4-today-landed.png`, `fix11-v5-today-t10.png`).
   - Honest note: the owner's exact off-center frame was NOT reproduced in
     any probe (orbit-away → Today, Global → Today, 70 s bearing drift →
     Today all landed centered even before the fix — the residual was the
     ~7 u stale landing + snap, which is now eliminated). If the large
     off-center state recurs, capture it live and reopen.

2. **Distance doubled (`frontend/components/world/layout.ts`)**
   - `FLEET_CIRCLE.radius` 90 → 180 (fishboat↔lamp). One definition —
     `orbitState`/`followPose`/`FISHBOAT_POS` all derive from it.
   - Knock-ons handled in the same change (kill, don't accumulate):
     - `Fleet.tsx` `MAX_SPEED` 5.5 → 11.0 u/s — ring tangential speed at
       R=180 is ω·R ≈ 8.1 u/s; the old cap would have left the pile lagging
       astern forever. `MIN_SPEED` 2.2 unchanged (< ring speed, no oscillation).
     - `CAMERA_PRESETS.topdown` y 220 → 440 (same relative ring framing).
     - `CAMERA_PRESETS.fleet` → [+110, 130, +380] (d≈417; ring subtends
       asin(180/417) ≈ 26° < 33° horizontal half-fov — whole R=180 circle in
       frame). First attempt [+90,110,+320] verified too tight at the edges.

3. **Small boats follow the fishboat — CONFIRMED**
   - Mechanism (read, not guessed): fishboat and fleet both derive position
     from the same analytic `orbitState(t)` (Fishboat.tsx:103,
     Fleet.tsx:95-103); each circling boat steers bow-first to its staggered
     pile slot in the flotilla frame (`pileSlot`, TURN_RATE-capped).
   - Verified visually on the doubled ring (`/lab` spawns LAB_DECKS):
     `fix11-v8-fleet-ring.png`, `fix11-v9-fleet-ring-t20.png` — Thermo 2/3
     trail the tug astern around the R=180 ring. Note: coupling is via the
     shared orbit function — anything moving the fishboat OUTSIDE
     `orbitState` would not be followed (nothing does today).

## Verification

- `tsc --noEmit` clean, `eslint` clean on touched files.
- `npx vitest run --config components/ui/__tests__/vitest.config.ts` —
  8 files / 35 tests pass. (Bare `npx vitest run` fails to resolve `@/` —
  the config lives in `__tests__/`; that is the documented harness quirk,
  not a regression.)
- Visual proof screenshots in `.labshots/fix11-*.png` (gitignored QA dir).
- No schema, API, or doc-contract changes; REQUIREMENTS/AGENTS/README have
  no constants that drifted (checked for R=90/radius mentions — none).
- Regression coverage note: an R3F/camera-controls unit test for the lead
  would be mock theatre (§6.5); the repeatable behavioral check is the
  puppeteer probe `.labshots/fix11-verify.mjs`.

## Follow-up (same session): Global view repair

UI review rated the hero views 9/10 but Global 3/10 — after the R=180
doubling the topdown camera (y=440) showed floating pills over empty haze.
Diagnosis (verified by cropping/zooming the shot, not guessed): NOT fog —
from directly overhead the lamp/boats collapse to their ~25 px footprints
and hide UNDER their DOM label pills. Height trade-offs alone could not fix
it (fit the ring → fog/tiny silhouettes; lower it → ring crops).
Fix: `CAMERA_PRESETS.topdown` is now a 46° aerial map (pos lamp+[0,300,320],
target biased 30 u toward camera) — silhouettes readable, near side of the
ring kept inside the 20° vertical half-fov at every orbit phase (verified at
two bearings 25 s apart: `.labshots/fix12-global*.png`). tsc/eslint clean,
35/35 tests pass. `fleet` preset unchanged from this session's earlier fix.

## Follow-up 2 (same session): demo seeded + opened on owner's screen

Owner opened the app in a fresh browser profile and saw an EMPTY world
(identity.ts generates a random UUID per browser → no data; atlas showed
the "still forming" empty state). Ran the canonical seed loader
(`Backend: .venv/Scripts/python.exe -m scripts.seed` — wipe + re-seed of
`user-seed-01`, idempotent): 4 tasks, 2 decks (1 circling, 1 docked),
3 cards, 48 KG nodes / 96 edges, 4 records, 1 narrate event. Verified via
the live API (`/api/world-state`, `/agents/kg/graph` with
`X-Harbour-User-Id: user-seed-01`). Opened a detached visible Edge window
with `harbour_user_id=user-seed-01` preset (`.labshots/demo-open.mjs`,
proof `demo-01-harbour.png`): fishboat + circling "Thermo 1" + lamp with
docked "Thermo Basics" render correctly. NOTE: the owner's own browser
profile remains the random-UUID user — the demo lives in the seeded window
(or set localStorage `harbour_user_id=user-seed-01` in any profile).

## State at end of session

- Ring R=180 live; Today/overview land dead-center; Global/fleet frame the
  doubled ring; fleet follows at up to 11 u/s. Dev servers were running
  (FE :3000, BE :8000) throughout; no git commits made.
