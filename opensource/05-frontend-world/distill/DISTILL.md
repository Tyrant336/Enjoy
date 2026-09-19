# DISTILL — 05-frontend-world → `frontend/`

## Goal (REQUIREMENTS.md §2 STRICT + §FR-2.5 + §FR-5.4)
Townscaper-cozy pastel ocean world in Next.js + react-three-fiber, matching the
reference screenshots exactly (palette, outlines, reflections, fog, NO RED),
with orchestrator-driven camera + boat animations.

## What to extract (per repo)

### `stylized-water/` — THE OCEAN (copy shader approach)
- Read its water material/shader + Codrops tutorial in the repo.
- Recreate as `frontend/components/world/Ocean.tsx`:
  - R3F plane with custom shader: pastel teal depth gradient, gentle waves, foam off
  - palette tokens (LOCKED): horizon `#cfeef0`-ish → deep `#1d8f96`-ish
    (sample from `Background/*.png`; fine-tune to match, then freeze in `theme.ts`)
- Alternative acceptable v1: three.js `Water2` with re-tinted colors + heavy fog.

### `camera-controls/` — CAMERA (npm package via drei)
- `npm install camera-controls` (drei `<CameraControls>` wraps it).
- Target: `frontend/components/world/CameraRig.tsx`
  - expose `flyTo(presetName)` via the worldBus (04/distill):
    presets = `fishboat | fleet | lamp | underwater | reviewPOV`
  - every transition: `setLookAt(..., true)`, eased, ≥1.5 s (NFR-1 comfort)

### `WaterThreeJS/` + `three-good-godrays/` — UNDERWATER (copy effects)
- From WaterThreeJS read: underwater fog color, caustics approach, marine-snow
  particles, surface-from-below rendering.
- From three-good-godrays: the godrays pass setup for pmndrs `postprocessing`.
- Target: `frontend/components/underwater/UnderwaterScene.tsx`
  - marine snow: drei `<Sparkles>` is acceptable v1 shortcut
  - godrays aimed from surface; palette stays teal/cyan, NO red

### `irregular_grid/` — TOWNSCAPER GRID (reference only)
- Read for the organic-grid math. v1 likely does NOT need the grid (open ocean
  scene); keep for a future "floating islands" feature. Do not integrate in scaffold.

### `THREE-CustomShaderMaterial/` — TOON/OUTLINE LOOK (optional)
- The reference look = flat pastel + soft dark outline.
- v1 shortcut: `THREE.MeshToonMaterial` + drei `<Outlines>` on boat models.
  Use CustomShaderMaterial only if that falls short.

## Scene composition (LOCKED to reference images)
```
frontend/components/world/
  Ocean.tsx          # stylized water + fog + MeshReflectorMaterial reflections
  Sky.tsx            # drei Sky/gradient, pale cyan mist, low-contrast horizon
  Fishboat.tsx       # GLB: boat-tug-* (see 06/distill), "Today" label pill
  SmallBoat.tsx      # GLB: boat-sail-*, instance per deck, label pill = deck name
  LampBuoy.tsx       # GLB: buoy + street-light, warm emissive, "Journal" pill
  LabelPill.tsx      # rounded cream pill w/ dark navy text + soft shadow (HTML/CSS3D)
  Fleet.tsx          # fishboat leads boats circling lamp (FR-2.4)
  ReviewMode.tsx     # boat-POV review (FR-2.5): camera on boat, question tag,
                     # 4 grade boats (Again/Hard/Good/Easy), sink/rise animations
  UnderwaterScene.tsx# godrays + snow + KnowledgeAtlas (03/distill)
```
- Circle animation: boats on a slow circular path around the lamp (radius ~fleet
  size), gentle bobbing (sine on y + slight roll).
- Sink: tween y below waterline + fade + ripple ring + soft splash particles.
- Rise: reverse, "out of nowhere" ahead of player boat.
- Dock at lamp: sail-to-lamp path tween + lamp emissive pulse (FR-4.3).

## Contracts consumed (do not invent others)
- World commands over WS: see **04/distill** message list (`worldBus.ts`).
- Card JSON for ReviewMode: see **02/distill**.
- Graph JSON for KnowledgeAtlas: see **03/distill**.

## Dependencies to add
`three`, `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`,
`camera-controls`, `zustand`, `gsap` (tours)

## Hard rules (from REQUIREMENTS.md §2 — the scaffold MUST enforce)
- NO red anywhere (hue 345°–15° banned); "Again" grade boat = soft amber.
- Palette/outline/reflection/fog match `Background/*.png`; side-by-side screenshot
  check is part of acceptance (NFR-3).
- All motion slow + eased; no abrupt cuts (NFR-1).

## DO NOT take
- react-three/drei examples' HDRIs with warm/red sunsets; any demo scenes from these
  repos verbatim (styles won't match); irregular_grid integration (v1 skip).
