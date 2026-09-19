# DISTILL — 06-assets-cc0 → `frontend/public/models/`

## Goal
Copy the chosen GLB models into the frontend as static assets, re-tinted to the
LOCKED palette (REQUIREMENTS.md §2, NFR-2: NO red). All CC0 — no attribution needed.

## Model selection (LOCKED, 2026-09-19) — final assets only

### The 3 locked models (already copied to `frontend/public/models/`)
| File | Role | Source |
|---|---|---|
| `fishboat.glb` | 🛳️ THE fishboat — plump vintage steam trawler: cream hull, charcoal chimney w/ cream band, wheelhouse, 2 masts | custom-built, `build_hero_models.py` (edit in `hero.blend`) |
| `lamp-buoy.glb` | 🏮 THE lamp — floating light buoy: cream tapered base + float collar, charcoal lattice cage tower, warm glowing lamp room, conical cap | custom-built, same script |
| `smallboat.glb` | ⛵ deck boats + leader boat (1.15× scale, soft purple sail re-tint) + the 4 grade boats | Kenney `boat-sail-b.glb`, **CC0** |

Regenerate heroes: `blender --background --python build_hero_models.py`
Quick look without Blender: `hero_preview.png`

❌ Rejected & deleted: Kenney tugs ("too childish"), Quaternius street light (wrong
lamp type), boat-sail-a, buoys, pirate kit.

## Required processing (Blender)
1. Custom models (`fishboat.glb`, `lamp-buoy.glb`) already use the LOCKED palette —
   no re-tint needed. Edit via `hero.blend` if tweaks are wanted.
2. `smallboat.glb`: check sail/hull colors — re-tint sail to pastel (soft purple for
   the leader boat / sage / grey-blue); NEVER red. sail-b is nearly compliant already.
3. Scale sanity: fishboat ≈ 3–4× small boat length.

## Viewing
- `hero.blend` — the two custom hero models (fishboat + lamp buoy).
- Regenerate: `blender --background --python build_hero_models.py`.

## Runtime notes for the FE agent
- Load with drei `useGLTF('/models/fishboat.glb')`; enable `<Outlines>` for the
  toon outline look (05/distill).
- Add per-instance sail color override for small boats (deck color coding).
