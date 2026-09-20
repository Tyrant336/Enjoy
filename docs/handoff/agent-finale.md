# HANDOFF — FINALE v2: finish ALL programming + full self-QA (AFK overnight)

> Written by the monitor, 2026-09-20 ~00:45. **This file IS your whole prompt.**
> The owner is asleep. When they wake, they have time ONLY for the demo video
> and the presentation — **zero programming can remain.** You are the last
> programming run. Completeness beats elegance; the §8 done-list is your
> definition of finished. Everything ambiguous is pre-decided below.

## ⚠️ SECTION 0 — ANTI-ROGUE PROTOCOL (zero tolerance)

A previous agent corrupted `SkyDome.tsx` by pasting a duplicated block into it
and left the build red. You will not repeat this.

1. **One file at a time.** Read it fresh from disk, edit surgically (never
   whole-file rewrites), gate it, move on.
2. **Gate after EVERY frontend file:** `npx tsc --noEmit` green. Red from your
   edit = fix NOW, before anything else.
3. **3-strike rule:** any step failing 3 honest attempts → STOP, log under
   "BLOCKED — needs human" in your session file (exact command + output + your
   root-cause read), continue with the next step. Never patch around reality.
4. **No git. No subagents. No new deps** except `puppeteer-core` (dev-only).
   No refactors outside the mission. Minimal diff. Match existing style.
5. **Evidence or it didn't happen** (AGENTS.md §1.2): every "done" claim names
   the command run and what it printed. Screenshots for anything visual.

## 1. Verified state at handoff (monitor-executed — trust, verify cheaply, don't re-audit)

**Backend P1: DONE and live-proven** (tonight, real Postgres + real OpenRouter):
- `POST /agents/flashcards/generate` (multipart `file` + `deck_name`) → Deck +
  persisted LLM cards + `.apkg` at `apkgUrl`; emits `spawn_boat` SSE.
  Proof: biology PDF → 8 cards + `/static/decks/deck-e0f6fdff.apkg`.
- `POST /agents/kg/build` (multipart `file`) → `{nodes, links, fallbackUsed}`
  merged delta. Proof: cs PDF → graph grew 48→60 nodes.
- `/static` mounted. Suite 198 passed / 2 skipped / 95.67% cov, ruff clean.
- Fixtures for QA: `Backend/tests/fixtures/{biology-photosynthesis,
  history-french-revolution, cs-neural-networks}.pdf`.
- **BE gaps you ARE sanctioned to touch (only these two):**
  (a) `PUT /api/preferences` (§5.2) — missing; you add it + one pytest.
  (b) `Backend/app/agents/{flashcards,kg}/prompts.py` — you may TUNE prompts
      if your content-QA (Step 6) finds quality problems. Nothing else in
      `Backend/**` is yours.

**Frontend: RED at handoff** (executed tonight):
- `components/world/SkyDome.tsx` — corrupted tail (duplicated block after the
  component's end; tsc fails line 176+). **This kills the whole page compile →
  the harbour and its boats cannot render.** A UI-polish agent may have fixed
  or further changed files since — READ, don't assume.
- Upload UI: absent. Atlas: reads `lib/fixtures/atlas-seed.json`
  (`AtlasLayer.tsx:22`), not the endpoint. Reduced-motion toggle: absent.
  `.apkg` link: absent.
- Working tree dirty with the polish agent's visual work — **keep its visual
  decisions**; you fix compile errors and add integration only.

**Locked owner decisions:** voice/TTS CUT (no ElevenLabs — text transcript
only; build zero voice code) · small boats = flashcard decks only · no red ·
no pressure mechanics.

## 2. Visual truth (the "outlook" the owner wants popping up)

- **Above-water look = `Background/Screenshot 2026-09-18 220556.png` +
  `220638.png`** (visual source of truth, REQUIREMENTS §0.1): calm teal water,
  misty horizon ~half the viewport, fishboat leading a line of small sailboats
  (pastel purple/sage/grey-blue sails), big cream **"Today"** pill over the
  fishboat, cream **"Journal"** pill over the lamp buoy, soft mirrored
  reflections, generous negative space. Motion feel: `Background/Steam
  2026-09-19 10-50-46.mp4`. Measured details: `Background/BACKGROUND_ANALYSIS.md`.
- **System intent = `Idea/` WhatsApp sketches** (hand-drawn, intent only):
  fishboat → scheduler (break big task into seeable timetable, labels around
  the fishboat); small boats → anki decks (fleet steers a circle while
  reviewing; done → sails to the lamp); lamp → records; under-sea → knowledge
  graph; narrator → orchestrator. Your integration must make THESE stories
  visible, not invent new ones.
- Your Step 7 screenshot QA compares against these side-by-side.

## 3. Read-first

`AGENTS.md` (root) · `frontend/AGENTS.md` + `frontend/CLAUDE.md` ·
`docs/REQUIREMENTS.md` §2, §5.2, §5.3, §7.2–7.4, FR-2.4/2.5, §4.3 · then the
files you touch, fresh from disk: `components/world/SkyDome.tsx`,
`components/ui/{api.ts,actions.ts,ChatPanel.tsx,Banners.tsx,ViewPanel.tsx,
TaskSheet.tsx}`, `components/world/worldStore.ts`, `lib/worldBus.ts`,
`components/underwater/AtlasLayer.tsx`, `lib/atlas/atlasAdapter.ts`,
`Backend/app/api/world.py` + `Backend/app/models.py` (for Step 5).

## 4. Environment (get the real stack up FIRST, keep it up all run)

```
docker compose up -d db                     # Postgres on :5433 (likely already up)
cd Backend && .venv/Scripts/python.exe -m scripts.seed
cd Backend && .venv/Scripts/python.exe -m uvicorn app.main:app --port 8000
cd frontend && npm run dev                  # :3000
```
Identity: the FE auto-sends `X-Harbour-User-Id` (localStorage UUID). Seeded
user `user-seed-01` exists via the seed script.

## 5. Build mission (strict order)

### Step 1 — Unbreak, then green gates
Read `SkyDome.tsx` fully. If the corrupted duplicate tail is still there,
delete everything after the legitimate component end (exactly ONE component
definition must remain). Then: `npx tsc --noEmit` ✓ · `npm run build` ✓ ·
`npm run lint` ✓ · `npx vitest run` ✓. If OTHER files are also broken (the
polish agent is mid-flight), fix compile errors surgically — never redesign.

### Step 2 — Seeded world renders (the owner's "no boats" pain)
Puppeteer screenshot `.labshots/finale-01-harbour.png`: fishboat + "Today"
pill, lamp + "Journal" pill, circling "Thermo 1" boat + docked "Thermo Basics"
boat, reflections. Compare against `Background/Screenshot 2026-09-18
220556.png`. Blank canvas → read the browser console, fix the root cause.

### Step 3 — Upload flow
Calm paperclip in `ChatPanel` (aria-label, keyboard-focusable):
1. First upload → one-time §7.3 dialog "Your text is sent to OpenRouter for
   processing." [Continue]/[Cancel], consent in localStorage, cancel = no-op.
2. Client validation: `.pdf .pptx .docx .md .txt`, ≤25 MB, one at a time;
   violations → soft-amber inline message listing accepted formats.
3. SAME file → `POST /agents/flashcards/generate` (`deck_name` = filename
   minus extension) AND `POST /agents/kg/build` (two calls, one upload).
4. Calm staged loading copy, slow teal pulse, expect 30–90 s. No flashing.
5. Success → boat arrives via the EXISTING `spawn_boat` bus→store path
   (verified present — use it, don't duplicate) + warm chat one-liner.
6. Failure → §5.2 envelope → existing `Banners` soft-amber, server `message`
   verbatim. `fallbackUsed: "keybert"` → gentle informational note.
Extend `actions.ts`/`api.ts`; grep before writing (§1.7).

### Step 4 — Atlas on live data (the underwater world — its OWN visual universe)
`AtlasLayer` fetches `GET /agents/kg/graph` via `api.ts` → `atlasAdapter.ts`.
Empty graph → §7.2 "Your atlas is still forming" placeholder. Remove the
fixture import from the live path (file may stay for vitest). Refresh on the
same resync moment worldBus uses — no second channel.
**Underwater visual acceptance (REQUIREMENTS §2.2/FR-3.4–3.6, source of truth:
`opensource/07-underwater-atlas/`):** dive transition eased ≥1.5 s with teal
veil; additive-glow nodes; directed signal-flow edges; cluster colors from the
approved NO-RED palette (teal/cyan/green/purple/violet/amber, hues ≥40°
apart); node click → detail drawer with gloss + linked deck/task ids; a
visible "Surface" control always exists. The two worlds are deliberately
different scenes (§4.3 two-scenes solution) — do NOT try to unify their looks;
the underwater one stays dark/bioluminescent.

### Step 5 — Toggle + the ONE new BE endpoint
- `ViewPanel`: reduced-motion toggle → `worldStore.setReducedMotion`
  (store honors it everywhere already; you add chrome only).
- BE exception (a): `PUT /api/preferences` per §5.2 — `{timezone?,
  reducedMotion?, labelsVisible?}` → persisted in `users.prefs` JSONB (verify
  `Backend/app/models.py` first), returns updated prefs. One pytest. Wire the
  toggle (+ labels toggle) to it; call failure → local state holds AND
  soft-amber banner (never silent).
- After: `cd Backend && .venv/Scripts/python.exe -m pytest -q --tb=short`
  (~5 min) — green, coverage ≥90%.

### Step 6 — SELF-QA BATTERY (you are the QA department; real everything)

**6A. Content quality (real OpenRouter, real PDFs — the owner's explicit ask):**
Upload all 3 fixture PDFs through the UI (or `api.ts` harness). Then READ the
outputs and score each domain 1–5 in a rubric table in your session file:
- *Cards:* one concept each? Q ≤25 words? A ≤40 words? Actually answerable
  from the source? No duplicates? No hallucinations beyond the source?
- *KG:* node labels sane? Types within the allowed set? Edges meaningful?
- *Plans:* chat 3 big tasks ("I'm overwhelmed — calculus exam in 5 days",
  "learn Python basics", "organic chemistry midterm next month") — are tasks
  TOPIC-SPECIFIC (not Mad-Libs)? Goal clean (no "I'm overwhelmed", no zone
  words)? "in 5 days"/"next month" reflected in the schedule?
**Any domain < 4/5 → tune the responsible `prompts.py` (sanctioned exception
b), re-generate, re-rate. Max 3 tuning rounds, keep the best, record all
rounds.** BE suite must stay green after tuning.

**6B. Error-path QA (record command + observed behavior for each):**
kill uvicorn mid-upload → soft-amber, no silent world · stop Postgres
(`docker stop enjoy-db`) → mutation fails with amber banner, restart after ·
upload a `.exe` → `DOCUMENT_UNSUPPORTED` envelope · >25 MB file → rejected ·
corrupt PDF (truncate a fixture copy) → parse-failure envelope · wrong
OpenRouter key at runtime (bad `OPENROUTER_API_KEY` in a THROWAWAY env, then
restore) → §5.2 envelope + SSE `error`, never canned content.

**6C. Persistence QA:** grade cards in a generated deck → page refresh →
grades/deck state survive. Restart uvicorn → world-state intact.

**6D. Performance sanity:** record upload wall-time per fixture (note in
session file); harbour animates smoothly; atlas with 60+ nodes interactive.
No micro-optimizing — flag, don't rewrite.

**6E. Accessibility QA:** keyboard-only 3-card review (`Tab`/`Enter`/`1–4`/
`Esc`), `L` toggles labels, reduced-motion toggle makes camera cuts/fades.
Run the puppeteer-feasible legs of `docs/PHASE3-E2E-CHECKLIST.md` A/B/C/D and
record PASS/FAIL **inline in that file**.

**6F. Visual QA (BOTH worlds):** above-water screenshots vs
`Background/*.png` side-by-side — palette, horizon proportion, cream pills,
pastel sails, reflections, no endline. Underwater screenshots vs the §4.3
acceptance list above — glow nodes, signal-flow edges, no-red clusters, dive
veil, drawer. Run `Backend/.venv/Scripts/python.exe -m scripts.no_red_check`
(must pass — it covers atlas cluster hues).

### Step 7 — `.apkg` + finishing touches
Docked/completed deck → "Download Anki deck" link (`Deck.apkgUrl`, new tab,
hidden when null). All new controls keyboard-reachable. `frontend/README.md`
updated if run commands changed.

## 6. Screenshot evidence (`.labshots/`, gitignored — the owner reviews these)

`finale-01-harbour.png` · `finale-02-upload.png` (mid/after upload, notice
visible on first run) · `finale-03-new-boat.png` (generated deck in fleet) ·
`finale-04-atlas-grown.png` (>48 nodes underwater, glow + edges visible) ·
`finale-04b-atlas-drawer.png` (node detail drawer open on a generated concept) · `finale-05-review.png` (review POV
of a GENERATED card, 4 grade boats) · `finale-06-persist.png` (post-refresh) ·
`finale-07-apkg.png` (link on docked deck) · `finale-08-reduced-motion.png` ·
`finale-09-sidebyside.png` (your render vs the Background reference).

## 7. Hard don'ts

No git · no subagents · no voice code · no new deps beyond puppeteer-core ·
no touching `Backend/app/schemas.py`, `frontend/lib/types.ts`,
`alembic/versions/001*` · no redesigning the polish agent's visuals · no
streaks/guilt/countdowns/red · no mock data, no demo modes, no silent
fallbacks anywhere · no TODO/stub left in live paths.

## 8. Done means (the monitor re-executes every line in the morning)

- [ ] FE gates green (tsc/build/lint/vitest); BE suite green ≥90% cov.
- [ ] Harbour renders with seeded boats (finale-01) — owner's "no boats" fixed.
- [ ] All 3 fixture PDFs upload end-to-end through the UI; notice once; calm
      loading; boats spawn without refresh.
- [ ] Content-QA rubric in session file: every domain ≥4/5 (or tuning-round
      evidence + best result + honest residual issues).
- [ ] All 6B error paths proven with observed behavior; none silent.
- [ ] Persistence survives refresh + backend restart (finale-06).
- [ ] Atlas live (finale-04/04b), empty-state exists, fixture out of live
      path; underwater §4.3 acceptance verified (glow, edges, no-red clusters,
      dive veil, drawer, Surface control).
- [ ] `PUT /api/preferences` live + tested; motion toggle persists.
- [ ] `.apkg` link; keyboard-only review passes; checklist file updated inline.
- [ ] `finale-01..09` screenshots exist; no-red check passes.
- [ ] Session file `docs/sessions/NNN-finale.md` (NNN = next free; 025–029
      exist) with: commands+outputs, QA rubric, tuning rounds, BLOCKED items,
      and an honest "what the owner should check before the video" list.

**If you run low on context: finish the §8 list in mission order, write the
session file with what's proven vs. pending, and stop cleanly. A truthful
90% beats a corrupted 100%.**
