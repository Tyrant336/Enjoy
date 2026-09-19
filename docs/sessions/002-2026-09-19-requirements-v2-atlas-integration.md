# Session 002 — 2026-09-19 — Requirements v2.0 + underwater atlas integration

## Goal
Incorporate PRD review feedback into `docs/REQUIREMENTS.md`; resolve how the
separately-provided underwater atlas scene integrates with the above-water world;
lock PostgreSQL + three.js decisions from the new `AGENTS.md`.

## What was done
1. **`docs/REQUIREMENTS.md` rewritten → v2.0.** Changes:
   - Added §0 requirement precedence + MoSCoW scope tiers (P0/P1/P2).
   - "Game introduction" → **optional guided harbour tour**; "q button" → **"?"
     Help/replay-tour button** (§1, FR-5.3, `tour_offer` event).
   - FR-0: deterministic definition of a "big task" + direct-zone routing.
   - FR-2.5: exact review flow (reveal answer → grade boats → persist → sink/rise
     → "Return to harbour"; no-cards-due message).
   - FR-2.8: FSRS scope locked (py-fsrs P1; deterministic demo intervals P0,
     config-selected, never failure-triggered).
   - FR-3: graph persists in **PostgreSQL JSONB** (per AGENTS.md §5, overrides v1);
     rendering locked to the **three.js atlas engine** (`opensource/07-underwater-atlas`),
     react-force-graph rejected; cluster colors exclude red hue range.
   - "No red" scoped to *intentional authored* red (§2.1); §2.4 measurable visual
     acceptance checks added.
   - §4.2 locked v1 decisions: PostgreSQL only, REST + SSE (no WebSocket), backend
     owns state / Zustand projection, DEMO_MODE explicit config, local run
     (`docker compose up db` + uvicorn + next dev), skippable camera.
   - §4.3 **two-scene solution**: one Next.js app, two render layers; underwater =
     full-screen `AtlasLayer` mounting the 07 engine; `worldMode` state + dive
     transition; single data adapter (`atlasAdapter.ts`) mapping canonical graph →
     `CLUSTERS/NODES/EDGES`.
   - §5 canonical contracts: data models, REST table, exact `WorldEvent` SSE union
     (id/seq, idempotent, seq-ordered).
   - §7: error/offline/loading states, upload & privacy limits (25 MB, pdf/pptx/docx/
     md/txt, docs discarded after processing), accessibility (reduced motion,
     keyboard, transcript, contrast, skip-tour).
   - §8 acceptance criteria now executable as the E2E test.
2. **Unzipped** `opensource/Kimi_Agent_Anki Abyss_ Underwater Atlas.zip` →
   `opensource/07-underwater-atlas/` (React + vanilla three.js + GLSL star-map engine;
   data lives in `src/lib/atlas.js` as CLUSTERS/NODES/EDGES).
3. Updated `opensource/README.md` (added 07), `03-knowledge-graph/distill/DISTILL.md`
   (react-force-graph override note), `README.md` (07 + requirements v2 note).

## Decisions / overrides
- react-force-graph **rejected**; underwater = owner's three.js engine (07).
- SSE chosen over WebSocket (server→client events; client actions via REST).
- Storage: PostgreSQL everywhere (AGENTS.md §5); no SQLite/JSON persistence.

## State at end of session
- Requirements v2.0 is the active PRD. `Backend/` still empty. Frontend scaffold
  exists (`frontend/`), models in `frontend/public/models/`.
- Next: build Backend per `opensource/01–04/distill/DISTILL.md` + §5 contracts;
  FE: port `atlas.js` into `AtlasLayer` per §4.3.
