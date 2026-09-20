# Session 029 — Monitor verification + finale prompt (voice cut)

**Date:** 2026-09-20 ~00:20 · **Hat:** Monitor

## What happened

Owner reported: "AFK agent is done" but **no small boats visible** in the app;
a second agent is polishing UI. Monitor verification by execution found the
integration work from `agent-fe-p1-integration.md` **never landed** (or was
clobbered), and the tree is currently BROKEN:

## Verified findings (executed, not claimed)

1. **`frontend/components/world/SkyDome.tsx` is corrupted** — a duplicated
   trailing block after the component's real end (stray text + repeated
   `useFrame`/return chunk). `npx tsc --noEmit` fails with 5 syntax errors at
   line 176+. **Whole page cannot compile → harbour/boats cannot render — this
   is why the owner sees no small boats.**
2. Upload UI: absent (no FormData/`generate` call in `components/ui/**`).
3. Atlas: still on `lib/fixtures/atlas-seed.json` (`AtlasLayer.tsx:22`).
4. Reduced-motion toggle: absent from `ViewPanel.tsx`. `.apkg` link: absent.
5. BE: `PUT /api/preferences` (§5.2) still missing — the only BE gap.
6. BE otherwise confirmed DONE: suite 198/2/95.67%, ruff clean; live proofs
   from earlier tonight stand (generate → 8 cards + apkg; kg/build → 60 nodes;
   `/static` mounted; `spawn_boat` → `worldStore.spawnBoat` path exists).

## Actions taken (monitor zone: docs only)

- **`docs/handoff/agent-finale.md`** — the final AFK prompt. **Revised to v2
  (~00:45) after owner clarification:** owner has zero programming time after
  waking (video + presentation only), so v2 adds: (1) visual-truth section
  pointing at `Background/*.png` + `Idea/` sketches with a side-by-side
  screenshot QA duty; (2) a full SELF-QA battery (Step 6): content quality
  rubric on real LLM output from all 3 fixture PDFs with sanctioned prompt
  tuning (`agents/{flashcards,kg}/prompts.py`, max 3 rounds), error-path QA
  (kill backend/Postgres, bad ext, oversize, corrupt PDF, bad key),
  persistence QA, performance sanity, accessibility QA, visual QA + no-red
  check; (3) 9 required `.labshots/finale-*` evidence shots; (4) graceful
  context-exhaustion rule (truthful 90% > corrupted 100%).
- **`docs/REQUIREMENTS.md`** — owner decision recorded: **voice in/out CUT**
  (no ElevenLabs/TTS/STT; narration is text-only via transcript, FR-5.5).
  P2 line updated.

## NOT verified / open

- Whether the UI-polish agent is still mid-flight — its edits + the finale
  agent could collide. Owner should run ONE frontend agent at a time.
- mypy on the new BE deps still unverified (cold-cache timeout, session 028
  era). Finale agent's BE-suite run will surface it.
- §8.1 DoD checklist remains unexecuted until finale Step 6 lands.

## State at end

Backend P1: done & proven. Frontend: broken build + integration missing.
Everything the final agent needs is in `docs/handoff/agent-finale.md`.
