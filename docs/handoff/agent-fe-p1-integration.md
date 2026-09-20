# HANDOFF — FE↔BE INTEGRATION (the "giga prompt" — finish ALL remaining programming)

> Written by the monitor, 2026-09-19 ~23:45, after live-verifying P1 backend.
> **This file IS your prompt.** Owner will run you in AFK mode: work
> autonomously, end-to-end, no questions — every ambiguity below already has a
> locked decision. You finish when §6 (Done means) is fully green.

## 0. Read-first (in order — they are law)

1. `AGENTS.md` (root) — §2 fail loudly, §3 one path (§3.4 NO REALITY MODES),
   §7 no pressure mechanics/no dashboards, §8 docs rules.
2. `frontend/AGENTS.md` + `frontend/CLAUDE.md` (Next.js 16 ≠ training data —
   check `node_modules/next/dist/docs/` before Next assumptions).
3. `docs/REQUIREMENTS.md` v2.1 — §5.2 (API), §5.3 (WorldEvent protocol),
   §7.2 (error states), §7.3 (upload constraints + OpenRouter notice),
   §7.4 (accessibility), FR-2.4/2.5 (boats = decks), FR-3.4/4.3 (atlas).
4. `docs/sessions/025` (eval: what's broken/known gaps) and `026` (P1 plan).
5. Existing code before writing any line: `frontend/components/ui/**`
   (api.ts, actions.ts, ChatPanel, Banners, ViewPanel, TaskSheet, TourUI),
   `frontend/lib/worldBus.ts`, `frontend/components/world/worldStore.ts`,
   `frontend/components/ui/uiStore.ts`, `frontend/components/underwater/AtlasLayer.tsx`,
   `frontend/lib/atlas/atlasAdapter.ts`, `frontend/lib/types.ts`.

## 1. Ownership & boundaries

- **You may write:** `frontend/**` only. **Never** `Backend/**`, never git.
- Contracts are frozen: `frontend/lib/types.ts` mirrors
  `Backend/app/schemas.py` — if you believe a type is wrong, STOP and write it
  in your session file; do not fork the contract.
- No new dependencies without listing them in your session file. No mock data,
  no demo modes, no silent fallbacks — a failed fetch is a soft-amber banner,
  never a quietly empty world (§2.5, §7.2).

## 2. VERIFIED backend state (monitor-executed 2026-09-19 23:33, trust this)

All live against real Postgres + real OpenRouter:
- `POST /agents/flashcards/generate` (multipart `file` + `deck_name`) →
  `Deck` + persisted cards + `.apkg` at `apkgUrl`; emits `spawn_boat` SSE.
  Live proof: biology PDF → "Bio Live Check", 8 cards, `/static/decks/deck-e0f6fdff.apkg`.
- `POST /agents/kg/build` (multipart `file`) → `{nodes, links, fallbackUsed}`
  graph delta, merged into Postgres. Live proof: cs PDF → graph grew 48→60 nodes.
- `GET /agents/kg/graph` → full canonical graph (§5.1) — **the adapter input**.
- All P0 endpoints (chat, tours, review, world-state, SSE) green;
  suite 198 passed / 2 skipped / 95.67% coverage.
- Auth headers: `X-Harbour-User-Id` (+ `X-Harbour-Timezone`) — `api.ts` already does this.
- **KNOWN BE GAP:** `PUT /api/preferences` (§5.2) is NOT implemented. Until it
  lands, persist prefs locally (worldStore already does) and note it; do NOT
  fake the call.

## 3. Mission (in order; each step ends with tsc+build+vitest green)

### Step 0 — Build must be green FIRST
`npx tsc --noEmit` + `npm run build` + `npm run lint`. If the
`ReviewMode.tsx` / `SmallBoat.tsx` signature mismatch (session 020-023 era)
or anything else is red, fix that before anything else. A red build blocks
everything below.

### Step 1 — Atlas on real data (kills the last fake-data path)
`AtlasLayer.tsx` currently reads `lib/fixtures/atlas-seed.json`. Fetch
`GET /agents/kg/graph` through `api.ts` and feed `atlasAdapter.ts` instead
(one data path, §3). Empty graph → the §7.2 gentle "Your atlas is still
forming" placeholder — never a black void. Refetch on `seq`-gap resync like
world-state (worldBus already rebuilds on reconnect — hook the atlas refresh
to the same moment, don't invent a second channel). Delete the fixture import
(kill, don't accumulate — the file may stay as a vitest fixture only).
Dive/surface behavior unchanged.

### Step 2 — Upload flow (the P1 money feature)
A calm upload affordance in `ChatPanel` (paperclip button, keyboard-focusable,
aria-labelled — §7.4). Flow, exactly:
1. **One-time notice (§7.3):** before the first cloud-bound upload, a gentle
   dialog: "Your text is sent to OpenRouter for processing." [Continue]
   [Cancel]. Consent persisted in localStorage; cancel = no upload, no guilt copy.
2. Client-side validation (§7.3): `.pdf .pptx .docx .md .txt`, ≤25 MB, one
   file at a time. Violations → soft-amber inline message listing accepted
   formats — never a raw exception.
3. Upload sends the SAME file to `POST /agents/flashcards/generate`
   (`deck_name` = filename without extension) AND `POST /agents/kg/build`
   (two calls, one ingestion story — no re-uploading, plan.md Phase 5).
4. Loading: slow teal pulse (§7.2), no flashing spinner. This takes 30–90 s
   (Docling + LLM) — the wait must feel calm and explained ("Reading your
   document… making cards… lighting the atlas…").
5. Success: the new deck boat arrives via the existing `spawn_boat` SSE
   handler (already in worldBus — verify, don't duplicate); a warm one-liner
   in chat ("'Bio Notes' joined your fleet — 8 cards ready."); atlas reflects
   new nodes on next dive.
6. Failure: §5.2 envelope → Banners soft-amber with the server's `message`
   field verbatim (never swallowed, §2.5). If the KG response has
   `fallbackUsed: "keybert"`, add a gentle note ("quick keywords mode") —
   informational, not alarming.

### Step 3 — `.apkg` download
Docked/completed deck → its label or stats affordance offers "Download Anki
deck" linking `Deck.apkgUrl` (already in `lib/types.ts:51`). Open in new tab.
If `apkgUrl` is null, hide the affordance (don't render a dead link).

### Step 4 — Reduced-motion manual toggle (§7.4, currently missing in prod)
Add a calm toggle to `ViewPanel` → `worldStore.setReducedMotion`. The store
already honors it everywhere (CameraRig, ReviewMode, Fleet, DiveOverlay);
your job is ONLY the chrome. Persistence: local (already) + note the missing
`PUT /api/preferences` (§2 gap) in your session file.

### Step 5 — Live verification (real, not claimed)
Start the real stack: `docker compose up -d db` (already running),
`uvicorn app.main:app --port 8000` (from `Backend/`, venv python), `npm run dev`.
Seed if needed (`python -m scripts.seed`). Then with a real browser driver
(puppeteer-core is sanctioned — session 022) or manual harness:
1. Upload `Backend/tests/fixtures/biology-photosynthesis.pdf` → deck boat
   appears, card count > 0.
2. Dive → atlas node count grew vs. seeded 48.
3. Full review of the new deck: reveal → grade `3` → persist → refresh →
   grade survived.
4. Screenshot evidence into `.labshots/` (gitignored): upload success,
   new boat, grown atlas, review of generated card.
5. `docs/PHASE3-E2E-CHECKLIST.md` legs A/B/C/D: run what a headless driver
   can; record PASS/FAIL inline in that file.

## 4. Hard rules while you work

- Small verifiable increments (§1.4): one step green before the next.
- Grep before creating (§1.7): banners, stores, bus handlers, api wrapper
  ALL exist — extend them, never duplicate them.
- No red anywhere (NFR-2); upload/notice/error UI uses cream/amber/teal tokens
  from `lib/theme.ts` only.
- No pressure copy (§7): upload errors are gentle; success is warm, never
  "streak"-flavored.
- Match existing style (§4.5); minimal diff; no drive-by refactors.

## 5. If something is impossible in AFK

Write it in your session file under "BLOCKED — needs human" with evidence
(command + output). Never patch around reality, never fake a PASS (§1.8).

## 6. Done means (monitor will re-execute every line)

- [ ] `tsc`, `npm run build`, `npm run lint`, `vitest` all green.
- [ ] Atlas renders from `GET /agents/kg/graph`; fixture import gone from
      live path; empty-graph placeholder exists.
- [ ] Real upload of all 3 fixture PDFs works end-to-end (decks + cards +
      graph growth + apkg link), with the §7.3 notice shown once.
- [ ] Reduced-motion toggle in production chrome; `Esc`/keyboard unaffected.
- [ ] Error paths render soft-amber banners with server messages (kill the
      backend mid-upload → explicit state, never silent).
- [ ] `.labshots/` evidence for each bullet; checklist file updated inline.
- [ ] `frontend/README.md` updated if run commands changed; your session file
      `docs/sessions/NNN-*.md` written (NNN = next free number — check the dir;
      025–028 exist) including any "BLOCKED — needs human" items.
