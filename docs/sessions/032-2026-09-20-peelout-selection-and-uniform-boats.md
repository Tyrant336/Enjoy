# Session 032 — Boat peel-out selection, 2× small boats, uniform sizes

Date: 2026-09-20. Owner asks: (1) clicking a small boat should animate it
OUT of the flotilla circle with a visible selection; (2) small boats too
small vs the fishboat; (3) later: the review boat blocked the whole view;
(4) make ALL small boats the same size.

## Decisions (owner, via AskUserQuestion + direct asks)

- Click = sail out + review (ONE path — no separate select state).
- Small boats 2×: `SMALLBOAT_LENGTH` 3.2 → 6.4 (a fifth of the 32 u tug).
- §2.3.2 leader scale (1.15×) REMOVED — all small boats one size; the
  leader keeps only its soft purple sail tint (`LEADER_SCALE_MULT` deleted,
  §3.6 kill). Owner override of the §2.3.2 scale, recorded here.

## What was built

1. **Peel-out (`Fleet.tsx`)**: on `reviewing`, the deck sails radially OUT
   of the ring (away from the lamp) to a 24 u outpost — eased 2200 ms
   (`PEEL_MS`, easeInOutCubic, TURN_RATE-capped bow; reduced motion =
   instant cut §7.4), then holds. Exit review → `circle` status steers it
   back to its pile slot (existing path, no teleport).
2. **Selection cue (`SelectionRing.tsx`, new)**: soft lantern-cream halo on
   the water riding the reviewed boat, breathing opacity pulse (frozen under
   reduced motion). Palette-locked, never red.
3. **Review POV chase (`CameraRig.tsx`)**: the static one-shot POV became a
   per-frame exponentially-damped stern chase (`povEye/povLook` refs, τ≈0.8 s
   → ≥1.5 s settle, NFR-1) so the camera follows the boat THROUGH the
   peel-out and holds ≈30° subtense. First pass (−7.8/2.4) let the 6.4 u
   boat swallow the frame (owner screenshot); current: eye −14/+3.5, y 7.0.
4. **Scale knock-ons (same change, §3.6)**: pile corridor d/w widened
   (later rewritten by the concurrent agent — see below), dock slots
   r 7→10 (+3/ring), pill heights 4.2/3.6 → 7.4/6.4, Anki link 2.9 → 5.2,
   dock glow 1.2→2.2/dist 9.

## TWO-AGENT CONCURRENCY (important)

A second agent worked `layout.ts` in parallel this session: they flipped
`FOLLOW_OFFSET` to ride ASTERN ([-116, 56, 118] — the default view now
shows the tug leading its pile toward the camera, fixing "small boats never
visible") and rewrote `pileSlot` to DERIVE from `FOLLOW_OFFSET` (do NOT
hardcode pile numbers — their note). My earlier pile-tuning was superseded;
I left their derived `pileSlot` untouched. One of my CameraRig edits was
overwritten in the crossfire — re-read before editing, always.
OPEN ITEM (owner to decide): with the astern camera the LAMP is off-frame
in the default view (their honest flag, verified: `fix14-0*.png`). Options:
keep astern (fleet visible, lamp hidden) / revert / lateral 3/4 offset to
show both. Not decided at session end.

## Verification

- tsc + eslint clean; 35/35 vitest (correct config: `--config
  components/ui/__tests__/vitest.config.ts`).
- Peel-out/review verified end-to-end with the REAL backend (seed user):
  `.labshots/fix13-*.png` — pill click → boat peels out with halo → POV
  chase → card UI; Esc returns it toward the pile.
- Uniform sizes + astern framing: `.labshots/fix14-01/02.png` (three equal
  boats trailing the tug). Cosmetic: pile labels bunch when boats cluster
  (also flagged by the other agent — not fixed here).

## Demo footage recorded (owner request)

Reset the demo (seed re-run), then recorded the golden path with a puppeteer
screencast (`.labshots/record-demo.mjs`; ScreenRecorder needs `ffmpeg` — the
imageio-bundled binary is copied to `.labshots/bin/ffmpeg.exe`, gitignored):
harbour → 🎣 Today (camera centers) → Today sheet (2 tasks) → click
"Thermo 1" → peel-out + halo + POV → Reveal → grade Good (key 3) → Esc →
Atlas dive (48/96 graph) → surface → 💡 Lamp glow + docked boat. 53 s,
1440×900. Deliverable: `Background/enjoy-demo-2026-09-20.mp4` (7.9 MB,
h264; source webm in `.labshots/`). Frames spot-checked at 8/25/36/38/44/51 s.
Gotcha fixed mid-way: the 💡 Lamp click right after surfacing is overridden
by the surface→overview handoff — wait ~6 s. Demo re-seeded to pristine
AFTER recording (the flow grades a card).

## Follow-up 3 (same session): occlusion fix + flotilla freeze during review

Owner report: (a) the small boat is still blocked behind the tug in the
default view; (b) boats that aren't needed should STOP following while the
owner solves flashcards.

(a) Root cause (measured, not guessed): the first pile boat sat 5 u off the
   camera→tug sightline — atan(5/148) ≈ 1.9° < the tug's ≈2.8° beam, i.e.
   INSIDE the silhouette. Fix: pileSlot lateral clearance w 5+1.8i →
   11+3i (tuned INSIDE the concurrent agent's FOLLOW_OFFSET-derived
   corridor — their derivation untouched, numbers only). Verified:
   `.labshots/fix15-a1*.png` — three boats all clear of the hull.
   (Uniform size from earlier this session confirmed in the same shots.)

(b) Flotilla freeze: new `orbitNow(t)` in worldStore — THE paused-aware
   orbit clock. All four `orbitState` consumers (Fishboat, Fleet, CameraRig,
   Ocean) route through it; pause/resume derives LAZILY from
   `reviewing != null` (every entry/exit path covered, two store writes per
   review, zero re-render subscriptions). The WHOLE flotilla freezes —
   freezing only the small boats would leave them chasing the tug for
   minutes; freezing the tug naively would teleport it on exit. Verified:
   `fix15-b1` ≡ `fix15-b2` (8 s apart mid-review — world static),
   `fix15-b3→b4` (motion resumes, reviewed boat sails back into formation).

## State at end of session

Sizes uniform at 6.4 u; selection = peel-out + halo + stern chase POV;
dev servers running; no commits. Framing decision (lamp vs fleet in the
default view) pending the owner.
