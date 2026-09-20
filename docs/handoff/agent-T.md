# Handoff — Agent T (three.js World) → fresh agent

> Written 2026-09-19, end of token budget. You are the **new Agent T**. You own
> EVERY pixel of 3D in the "enjoy" project (C:\Users\lsu22\enjoy) — a cozy
> Townscaper-style 3D ocean world that automates studying (hackathon).

## Role + ownership zone

Exclusive write access:
- `frontend/components/world/**` (harbour world: Ocean, SkyDome, Fleet,
  Fishboat, LampBuoy, SmallBoat, ReviewMode, CameraRig, LabelPill,
  WorldOverlays, HarbourCanvas, DiveOverlay, worldStore, boatRuntime, anchors,
  modelUtils, layout)
- `frontend/components/underwater/**` (AtlasLayer)
- `frontend/lib/atlas/**` (ported 07 engine `atlas.js` + `atlasAdapter.ts`)
- `frontend/lib/theme.ts` (LOCKED palette), `frontend/lib/worldApi.ts`
- `frontend/public/**`, `frontend/app/lab/**` (scratch sandbox, deleted before demo)
- Scratch/evidence: `.labshots/` (repo root; screenshot drivers + scans)

DO NOT touch: `app/page.tsx`, `app/layout.tsx`, `app/globals.css`,
`package.json`, `lib/types.ts` (frozen contract), L's files
(`lib/worldBus.ts`, `components/ui/**`, `Backend/**`), monitor's (`docs/**`
except your own session files, `README.md`). **No git commands, ever.**

## Read first (in order)

1. `AGENTS.md` — code law: §2 fail loudly, §3 one way/one path, §3.4 NO DEMO
   MODE, §8 docs rules.
2. `docs/REQUIREMENTS.md` — §2 (visual, LOCKED palette; **§2.4 updated: NO
   endline**; **§2.6 camera perspectives**), §4.3 (atlas "two scenes"),
   FR-2.5/2.6/2.9 (review loop, session rule), §5 (frozen contracts), §7.1/7.4
   (motion timing, accessibility).
3. `docs/BUILDING.md` — §2 (zones), §3 Phase 2 (Agent T row).
4. `docs/sessions/012-2026-09-19-phase1-world.md` (Phase 1 report),
   `docs/sessions/010`, `011` (no-demo-mode + audit).
5. Monitor directives (this handoff supersedes none of them):
   - "no BACKGROUND_ANALYSIS / Background/ citations in committed code" — say
     **"the locked local visual spec"** instead.
   - VISUAL CORRECTION (owner video review): kill the endline, strengthen
     reflections, §2.6 camera → **DONE, verified (below)**.
   - Then: **Phase 2 review POV** (the current queue).
6. `frontend/lib/worldApi.ts` (frozen signatures, now implemented),
   `frontend/lib/types.ts` (frozen), `docs/LABELS.md`.
7. Reference media (re-watch if touching visuals): `Background/*.png`,
   `Background/Steam 2026-09-19 10-50-46.mp4` (Townscaper: endless uniform
   teal water, prominent elongated mirrored reflections, free 3/4 orbit).

## VERIFIED state (evidence)

**Phase 1 (checkpoint-passed):** harbour + underwater atlas.
`.labshots/01..09-*.png` (driver `.labshots/lab-shots.mjs`). Details in
session 012. Highlights: horizon 50.5% ✓, no-red pixel scan 0/144000 ✓,
atlas 48 nodes/96 edges 60fps, node drawer, dive/surface, L-key toggle.

**Visual correction (this session — DONE):**
- Endline killed: `Ocean.tsx` — 5000 u plane + shader converges far water to
  shared `MIST_COLOR`; `SkyDome.tsx` — horizon = `MIST_COLOR` exactly, haze
  band weakened; `HarbourCanvas` — fog `(MIST_COLOR, 80, 700)`, camera far
  3000. Verified: `.labshots/vc-01..04-*.png` (driver `.labshots/vc-shots.mjs`)
  — overview/topdown/fishboat/lamp, NO band at the distance in any.
- Reflections: REPLACED in session 028 — the ocean is now a true planar
  mirror (three's Reflector + the custom water shader in `Ocean.tsx`);
  `modelUtils.makeReflection` (mirrored clones) was deleted. Do not
  re-introduce mirrored-geometry reflections.
- §2.6 camera: presets in `layout.ts` — overview (raised oblique eye, horizon
  measured 43–48% ✓ within band), topdown, fishboat-centric, lamp-centric,
  fleet, underwater, review. Free orbit via camera-controls
  (minPolarAngle 0.08 — never below water). `WorldCameraPreset =
  CameraPreset | "lamp" | "topdown"` (local extension, types.ts untouched).
- No-red scan on vc-01..04: 0/144000 each ✓.

**Gates RIGHT NOW: `npm run build` ✓ compiled · `npx tsc --noEmit` clean ·
`npm run lint` 0 errors 0 warnings.** Dev server runs in background on :3000.

## IN-FLIGHT: Phase 2 review POV (≈85% built, UNVERIFIED in browser)

Written this session, compiles+lints clean, but the runtime flow has NOT been
screenshot-tested yet. What exists:
- `worldStore.ts` — boats registry (spawnBoat/dockAtLamp/finishDock), review
  state (enterReview/showCard/revealAnswer/touchGrade/sinkGradeBoat/riseBoat/
  exitReview), tour (offer/start/advance/end), highlight, notice, worldError,
  `hostHandlers` (onOpenDeck/onOpenToday/onReveal/onGrade/onExitReview/
  onAcceptTour/onDismissTour). All worldApi-facing actions idempotent.
- `lib/worldApi.ts` — REAL implementation of all 14 frozen methods (throws on
  unknown deck / durationMs<1500 — loud by design).
- `Fleet.tsx` — store-driven boats: circle / reviewing / docking (2.2 s eased
  path, reduced-motion cut) / docked (dockSlotPos slots around lamp).
- `ReviewMode.tsx` — card boat (question pill, Reveal→answer pill, ripple),
  4 grade boats (Again=softAmber pastel row, text pills "1 · Again"…, rise on
  reveal, sink on grade, reduced-motion fades), Esc + keys 1–4, FR-L3.1
  always-visible pills.
- `CameraRig.tsx` — review POV (controls disabled, expo approach ~1.8 s onto
  stern, gentle bob, exit resyncs controls to avoid snap), tour runner
  (dwell → advance; underwater step dives; tourLabelTarget for FR-L3.2).
- `WorldOverlays.tsx` — notice pill, amber error banner, tour offer prompt,
  Skip tour, Return to harbour.
- `anchors.ts` — "today" screen anchor (Fishboat registers; L's TaskSheet
  consumes via `useScreenAnchor("today")`); Fishboat pill → flyTo fishboat +
  onOpenToday.
- `app/lab/page.tsx` — lab fixture (4 decks incl. docked; `THERMO1_CARDS` =
  exactly 3 mock cards), mock host handlers (open deck → enterReviewPOV +
  showCard; grade → 250 ms sinkBoat → 1150 ms riseBoat or completion →
  exitReviewPOV + dockAtLamp + setLampGlow + warm notice), worldApi ×2
  idempotency probe buttons, tour-offer demo.

**NEXT TASKS (exact queue):**
1. Verify the review loop end-to-end in the browser and capture evidence:
   POV glide → question → reveal → 4 grade boats → keys 1–4 grade → sink →
   rise ×2 → completion (dock at lamp + glow pulse + notice) → Esc mid-deck
   path → keyboard-only full run → reduced-motion variants → ×2 idempotency
   probes. Extend `.labshots/lab-shots.mjs` (pattern already proven:
   label-chip coordinates → `page.mouse.move` THEN `click`, hover before
   click or the engine/world sees no pointer).
2. Likely first bugs to expect: grade-boat row orientation (lateral sign),
   pill positions vs. camera POV framing, boat count when review UI overlaps
   the fleet circle.
3. No-red scan + horizon/§2.4 recheck on new shots; keep build/tsc/lint green.
4. Write `docs/sessions/018-2026-09-19-phase2-world.md` (goal, verified
   evidence list, deviations, unverified items), report to monitor.

## GOTCHAS (things that WILL trip you)

- Ports: FE **3000**, BE 8000, DB **5433** (Docker; host 5432 is native PG).
- NO DEMO MODE (AGENTS §3.4) — one runtime path; fixtures are deliberate test
  data in lab/ or seed scripts only. Mock cards live ONLY in `app/lab/page.tsx`.
- Frozen contracts: `Backend/app/schemas.py` ↔ `frontend/lib/types.ts` ↔
  `worldApi.ts` SIGNATURES. Never edit types.ts; CameraPreset lacks
  "lamp"/"topdown" → local `WorldCameraPreset` extension in worldStore.
- `smallboat.glb` was REPAIRED (external `Textures/colormap.png` never
  shipped → stripped, baked neutral base; hull navy + sail tint set in
  `SmallBoat.tsx`). Deviation already reported (session 012).
- three r186 linear workflow: custom ShaderMaterials MUST end with
  `#include <tonemapping_fragment>` + `#include <colorspace_fragment>` or
  colors render ~40% dark. Fog chunks need a variable literally named
  `mvPosition`.
- React 19 compiler lint: R3F `useFrame` mutations and two-phase
  mount/fade effects trigger react-hooks/immutability + set-state-in-effect.
  Use narrowly-scoped `eslint-disable` comments DIRECTLY above the flagged
  line (multi-line comment blocks break `disable-next-line` — directive
  attaches to the comment, not the statement).
- `lamp-buoy.glb` is authored 12 u off-origin → `GLB_OFFSET_X = -12` in
  LampBuoy. `LanternGlow` material drives glow (throws if missing).
- Zustand store is presentation-only; per-frame transforms live in
  `boatRuntime.ts` (Map), never in the store (60 Hz writes would re-render
  the world).
- sink_boat has no payload (§5.3): GradeBoat click does `touchGrade` first;
  `sinkGradeBoat()` sinks lastGrade; untouched → guarded no-op + console.warn.
- Engine picking (`lib/atlas/atlas.js`) needs a real hover (pointermove)
  before click; puppeteer: `mouse.move(x,y)` → wait → `mouse.click`.
- Headless Edge screenshots pad ~95 px page-background at the bottom
  (window-chrome quirk) — canvas is fine; metrics must account for it.
  `--no-save` puppeteer-core is already installed in frontend/node_modules.
- Screenshot/pixel tooling: `.labshots/lab-shots.mjs`, `vc-shots.mjs`,
  `scan.ps1` (no-red hue scan), PowerShell System.Drawing for pixel probes.
- WorldApi `flyTo` throws if durationMs < 1500 (NFR-1, loud by design).
- Label pills: master toggle in store; review/tour pills use `always` /
  `tourLabelTarget` (FR-L3 exemptions). `L` key handler lives in lab page.

## Rule set (how you work)

- Fail loudly: broken GLB/material/fixture = explicit soft-amber state on
  screen, never a silent empty canvas; contract violations throw.
- Verified-by-execution reporting only: build/tsc/lint outputs, screenshots,
  pixel scans. No claims without evidence; say plainly what is unverified.
- Small increments; run the build after each meaningful change.
- Ambiguity → note it in the session file and continue doc-faithfully
  (REQUIREMENTS wins); genuine contract conflicts → stop and report to monitor.
- Minimal diffs, stay in your zone, no drive-by refactors, kill don't
  accumulate. One way, one path.
- Session file per session (`docs/sessions/NNN-*.md`, next free number).
