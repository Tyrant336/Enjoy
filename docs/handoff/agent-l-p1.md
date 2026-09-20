# HANDOFF — P1 BACKEND BUILDER (the WHOLE of P1, backend only)

> Written by the monitor, 2026-09-19, after the four-agent eval (session 025).
> **This file IS your prompt.** Owner directive: *"Finish P1. Real done. I don't
> want to see P1 again."* Another agent owns ALL frontend work in parallel —
> **you write backend only.** P1 is finished only when
> `docs/P1-ACCEPTANCE-CHECKLIST.md` passes 100% under monitor execution.

## 0. Read-first (in order — they are law)

1. `AGENTS.md` (root) — esp. §1 (never guess, verify), §2 FAIL LOUDLY (no silent
   fallbacks, no swallowed exceptions), §3 ONE PATH (§3.4 NO REALITY MODES —
   zero tolerance), §4 structure, §5 Postgres+Alembic strict, §6 testing ≥90%,
   §8 docs rules.
2. `docs/REQUIREMENTS.md` v2.1 — §0.2 (P1 scope), §4.1/4.2 (locked decisions),
   §4.5 (retention: documents DISCARDED after processing; only artifacts +
   ≤200-char source snippets persist), §5.1/5.2 (contracts — the two endpoints
   you must implement are ALREADY SPECIFIED there), FR-1.5, FR-2.1–2.4, FR-2.8,
   FR-3.1–3.3, FR-5.3, §7.3 (upload constraints), §7.2 (error states).
3. `docs/sessions/025-2026-09-19-four-agent-eval.md` — the live eval: defects
   **D1–D6** you must fix, and the probe evidence that nothing LLM exists today.
4. `docs/sessions/016` (Phase 2 logic), `013` (models/seed lessons), `018`/`022`
   (test-suite state, shared-test-DB hazard).
5. Existing code before writing any line: `Backend/app/agents/**`,
   `Backend/app/services/**`, `Backend/app/api/**`, `Backend/app/core/config.py`,
   `Backend/app/models.py`, `Backend/app/schemas.py`, `Backend/tests/conftest.py`,
   `Backend/scripts/seed.py` + `scripts/seed_dates.py` (the date resolver you
   will wire into the planner — fixes D2).
6. Vendored references (integration specs, not requirements):
   `opensource/01-scheduler-fishboat/distill/DISTILL.md`,
   `opensource/02-anki-smallboats/distill/DISTILL.md`,
   `opensource/03-knowledge-graph/distill/DISTILL.md`,
   `opensource/04-orchestrator/distill/DISTILL.md`.

## 1. Ownership & boundaries

- **You may write:** `Backend/**` (EXCEPT: existing `alembic/versions/001*` —
  append-only, new migrations = new files; `app/schemas.py` — FROZEN, additions
  need monitor sign-off in your session report; response shapes must match §5.2
  exactly), `Backend/tests/fixtures/**` (new), `docs/sessions/**` (your session
  file), `Backend/README.md` (keep runbook true).
- **Never touch:** `frontend/**` (another agent owns it — see §7 coordination),
  `.env` values (report problems, don't silently change), root `AGENTS.md`.
- **No git commands, ever.** The monitor commits.
- Deps: add via `uv pip install` into `Backend/.venv` AND pin in
  `Backend/pyproject.toml`. Expected new deps: `docling`, `genanki`, `py-fsrs`,
  `langchain-openai`, `langgraph`, `keybert` (FR-3.2 fallback). Verify each
  import works on Python 3.12/Windows BEFORE building on it (§1.1: verify,
  don't assume — e.g. docling's Windows wheels).

## 2. Verified current state (monitor-executed, trust this)

- Backend suite: **132 passed / 2 skipped, coverage 97.67%**, gate at 90%.
  `harbour` DB at Alembic 001, docker `enjoy-db` healthy on port 5433.
- **No LLM code exists.** No ingestion. No upload endpoints. `OPENROUTER_API_KEY`
  is set and was verified live in session 001; `OPENROUTER_MODEL` is
  `deepseek/deepseek-v4.1-flash` — **text-only is FINE** (see §3 decision 1).
- What exists and works: deterministic router (`agents/orchestrator/router.py`),
  template planner (`agents/scheduler/planner.py`), review loop with P0 fixed
  intervals (`agents/flashcards/review.py`), KG read path, SSE outbox, seed.
- **Model locked (monitor-verified live, 2026-09-19):**
  `deepseek/deepseek-v4.1-flash` — exists on OpenRouter, **vision-capable**
  (`input_modalities: [text, image]`), answered a real hello call ("READY"),
  $0.15/M in · $0.60/M out, key valid + paid until 2026-09-26. The
  `.env.example` "text-only" warning refers to DeepSeek V3/V4 **Pro** (confirmed
  text-only in the live catalog), NOT this model. Do not change the model.
- Live-eval defects to fix along the way (session 025): **D1** emotional-prefix
  goal extraction too narrow, **D2** "in 5 days"/"next month" ignored (wire
  `seed_dates.py` resolver), **D3** zone words leak into plan goal, **D4** topic
  + single-zone drops the topic (LLM supervisor), **D5** Mad-Libs template tasks,
  **D6** slot labels repeat within a day.

## 3. Locked design decisions (monitor rulings — do NOT re-decide, do NOT build both)

1. **PDFs are parsed to TEXT by Docling; the LLM receives extracted text, never
   page images.** Therefore a text-only OpenRouter model is acceptable and the
   `.env.example` vision warning does not apply to this pipeline. (Vision models
   remain forbidden territory: none configured, none needed.)
2. **One LLM client wrapper** — `Backend/app/core/llm.py`, THE only module that
   talks to OpenRouter (AGENTS.md §3.1). Built on `langchain-openai`'s
   `ChatOpenAI` with `base_url`/`api_key`/`model` from `app.core.config.settings`.
   Every LLM output goes through **Pydantic structured output**
   (`with_structured_output`); parse by key; schema mismatch = hard error with
   the offending payload logged (§2.4). No regex parsing. Ever.
3. **One ingestion pipeline, shared by FR-2 and FR-3** —
   `Backend/app/services/ingestion.py`: validate (§7.3: `.pdf .pptx .docx .md
   .txt`, ≤25 MB, sanitized filename, wrong type → §5.2 `DOCUMENT_UNSUPPORTED`
   envelope) → Docling parse → typed `IngestedDocument` (title, chunks with
   provenance). Parse failure = loud `DOCUMENT_PARSE_FAILED` envelope; document
   bytes are DISCARDED after processing (§4.5). Both generators consume this —
   no second parser.
4. **LangGraph is used where it earns its keep, nowhere else:**
   - Ingestion→generation as ONE `StateGraph` per artifact type (flashcards,
     graph) with typed state. No checkpointer (§7.3 = one file at a time,
     synchronous; YAGNI).
   - Scheduler internals → plan-execute-replan per FR-1.5 P1 (reference:
     `opensource/01-scheduler-fishboat/langgraph-plan-and-execute`), emitting the
     UNCHANGED canonical `StudyPlan` contract (schemas.py does not change for
     this). Template planner is DELETED in the same change (§3.6 kill, don't
     accumulate) — its tests are rewritten, not kept "just in case".
   - Orchestrator: keep `route_message` as the first deterministic node; add an
     LLM supervisor fallback node ONLY for the ambiguous case (0 zones hit and
     not pure chitchat — this fixes D4). One graph, one path; no `if use_llm:`
     config branches (§3.2/§3.4).
5. **FSRS:** real `py-fsrs` replaces the P0 fixed-interval map (FR-2.8 P1). The
   `again|hard|good|easy` API contract and FR-2.9 session rule are UNCHANGED.
   Per-card state lives in the existing `flashcards.fsrs` JSONB column — inspect
   `app/models.py` first; if the column/shape is insufficient, migration `002`
   adds what's missing (never edit 001).
6. **`.apkg` export (FR-2.3):** genanki at generation time; file written under a
   served static dir; `Deck.apkgUrl` populated. Export failure = loud error
   (the deck still persists — cards are the primary artifact; apkg is derived
   and regenerable — but the failure must surface in the response/logs, §2.6).
7. **KeyBERT fallback (FR-3.2)** is the ONLY allowed fallback: LLM extraction
   failure → KeyBERT extraction, log WARNING, response includes
   `"fallbackUsed": "keybert"`. All other failures = §5.2 error envelope + SSE
   `error` event. No other fallbacks exist.
8. **LLM roadmap narration (FR-5.3 P1):** for big tasks, roadmap step narration
   is LLM-generated (≤2 warm sentences, §7.1 tone, no pressure mechanics §7.1/§7
   of AGENTS.md), validated into the existing `Roadmap` contract. Failure → loud
   error path, NOT canned text (§3.4).

## 4. The two endpoints (exactly per §5.2 — already specified, implement as written)

- `POST /agents/flashcards/generate` — multipart file + `deck_name` →
  `Deck` (+cards persisted). Card rules FR-2.2: one concept per card, question
  ≤25 words, answer ≤40 words — enforce in the output schema/post-validation;
  cards violating limits are hard errors, not silently truncated. Each card
  stores a ≤200-char source snippet (§4.5). Emits `spawn_boat` SSE event.
- `POST /agents/kg/build` — multipart file → merged graph delta. Allowed types
  ONLY: nodes `Concept|Term|Formula|Process|Example`, edges
  `EXPLAINS|PART_OF|REQUIRES|CONTRASTS_WITH|EXAMPLE_OF` (FR-3.2). Merge/dedupe
  by normalized label into `kg_nodes`/`kg_edges` JSONB tables (FR-3.3).
  Node `deckIds`/`taskIds` linking per §5.1 where attributable.

## 5. Work order (small verifiable increments — AGENTS.md §1.4; each stage ends green)

1. **Stage 1 — LLM client + ingestion.** `core/llm.py`, `services/ingestion.py`.
   Model is pre-verified (§2) — no model scouting needed. Tests: unit
   (chunking/validation) + failure paths (bad ext, >25 MB, corrupt file).
2. **Stage 2 — `POST /agents/flashcards/generate`** (+ genanki export). Real-PDF
   integration test with the fixtures below.
3. **Stage 3 — `POST /agents/kg/build`** (+ KeyBERT allowed fallback, merge logic).
4. **Stage 4 — py-fsrs** swap (grade path), migration if needed, regression tests
   proving FR-2.8/FR-2.9 semantics survive.
5. **Stage 5 — LangGraph scheduler** (plan-execute-replan, goal extraction via
   LLM — kills D1/D3/D5 — + `seed_dates` deadline resolution — kills D2).
6. **Stage 6 — Orchestrator LLM supervisor fallback** (kills D4) + LLM roadmap
   narration.
7. **Stage 7 — E2E + hardening:** the new golden path as an automated test
   (upload PDF → deck appears → review one card → graph grew → journal record),
   docs updates (README, REQUIREMENTS P1 checkmarks if the monitor approves),
   your session file.

**Test fixtures:** copy the 3 PDFs from `Backend/.scratch/agent-eval/pdfs/`
(biology/history/cs, generated by session 025) into `Backend/tests/fixtures/`
and commit them. If Docling cannot parse these hand-rolled minimal PDFs,
regenerate equivalent fixtures with a real library (add `reportlab` as a
dev-only fixture-generation script dep) — and say so loudly in your session file.

**LLM mocking rule (§6.5):** mock ONLY the OpenRouter HTTP boundary (e.g.
respx/httpx transport-level). Never mock ingestion, the DB, your own services,
or the component under test. Mandatory failure-path tests (§6.4): LLM returns
garbage/non-conforming JSON; OpenRouter unreachable/429/500; corrupt PDF;
oversized file; unsupported extension; KeyBERT fallback correctness.

## 6. Done means (monitor will execute `docs/P1-ACCEPTANCE-CHECKLIST.md` — all binary)

- All 4 §5.2 endpoints live with real PDFs, real OpenRouter, real Postgres.
- `alembic upgrade head` + `downgrade base` + `alembic check` clean.
- Full suite green, coverage ≥90% (gate enforced), ruff + mypy clean.
- Zero `DEMO_MODE`/mock/reality-mode code paths; zero silent fallbacks other
  than the sanctioned KeyBERT one; zero TODO/stub in live paths.
- Existing P0 behavior intact: session-025 eval re-run shows routing still
  correct and D1–D5 fixed.
- `AGENTS.md`/`README.md` drift check + session file per §8.

## 7. FE coordination (NOT your code — flag to monitor when your side is ready)

The FE agent needs, to consume your work: upload UI for the two multipart
endpoints; the §7.3 one-time OpenRouter notice; wiring `AtlasLayer` to
`GET /agents/kg/graph` (currently reads a static fixture — known gap); FE build
is currently broken by an in-flight `SmallBoat.tsx` signature change (theirs to
fix). Note these in your final report; do not implement them.
