# Session 029 — P1 Backend Build (the whole of P1, backend only)

**Date:** 2026-09-19 · **Agent:** P1 backend builder · **Prompt:**
`docs/handoff/agent-l-p1.md` (verbatim). **Acceptance:** `docs/P1-ACCEPTANCE-CHECKLIST.md`.

## What was built (all stages, each ending green)

| Stage | Deliverable | Evidence |
|---|---|---|
| 1 | `app/core/llm.py` (THE ONE OpenRouter wrapper, `with_structured_output` function-calling), `app/services/ingestion.py` (§7.3 validate → Docling → typed chunks, §4.5 nothing persisted) | `tests/test_llm.py` (8), `tests/test_ingestion.py` (20); live probe `.scratch/p1-verify/verify_llm.py` proved `deepseek/deepseek-v4.1-flash` exists + responds + does structured output |
| 2 | `POST /agents/flashcards/generate` — LangGraph extract→validate (FR-2.2 hard limits = loud `LLMError`, never truncation), per-card ≤200-char verbatim snippets, genanki `.apkg` → `Backend/static/decks/` served at `/static` (FR-2.3), `spawn_boat` event | `tests/test_generate.py` (5); live run below |
| 3 | `POST /agents/kg/build` — LangGraph extract→normalize→merge; KeyBERT is a **graph branch** triggered by `LLMError` only (the one sanctioned fallback, FR-3.2); merge/dedupe by normalized label into `kg_nodes`/`kg_edges` | `tests/test_kg_build.py` (5) |
| 4 | Real py-fsrs (PyPI name: `fsrs` 6.3.2) via `app/agents/flashcards/fsrs_state.py`; P0 fixed-interval map **deleted**. State in `flashcards.fsrs` JSONB (canonical keys + `step`/`lastReview` extras; contract ignores extras — **no migration needed**). `enable_fuzzing=False` (deterministic). FR-2.9 untouched | `tests/test_fsrs.py` (7), updated `test_review.py` |
| 5 | `app/agents/scheduler/planner.py` rewritten as LangGraph **understand → plan → execute → replan**; template planner deleted (§3.6). Goal extraction LLM (D1/D3), topic-specific breakdown (D5), `scripts/seed_dates.resolve_natural_date` wired (D2: "in N days/weeks/months", "tomorrow", "next week/month"; month≈30d documented), 4th slot "night" (D6) | `tests/test_planner.py` rewritten (25) |
| 6 | Orchestrator as ONE LangGraph: deterministic `route` → `supervisor` (LLM) **only if ambiguous** → `act`. Ambiguous = 0 zones & not chitchat, OR 1 zone + ≥3 residual content words (fixes D4). Roadmap narration LLM-generated (FR-5.3 P1), ≤2 sentences enforced, failure = loud error never canned text | `tests/test_orchestrator.py` (7) |
| 7 | `tests/test_golden_path.py` — upload PDF → deck → review+grade → graph grew → journal record, one test (G1). `test_e2e_demo.py` passes unchanged in behavior (G2) | full suite below |

## Verified by execution (commands + real output)

- **Full suite:** `.venv/Scripts/python.exe -m pytest` → **198 passed, 2 skipped
  (the 2 pre-existing browser-half skips; 0 new), coverage 95.67%** (gate 90%).
- **ruff** `check .` → All checks passed. **mypy** (strict, `mypy.ini`) →
  `Success: no issues found in 40 source files`.
- **Alembic** on scratch DB `harbour_scratch` (created+ dropped for the check):
  `upgrade head` ✓, `downgrade base` ✓, `upgrade head` ✓, `alembic check` →
  "No new upgrade operations detected" ✓. No migration 002 was needed.
- **Live OpenRouter eval re-run** (`.scratch/p1-verify/eval_live.py chat`,
  in-process ASGI app, dev DB `harbour`, nothing mocked; eval user rows
  deleted after) — session-025's 10 inputs, **16/16 checks PASS**:
  C01 big_task goal "prepare for the calculus exam" (D1 ✓, "in 5 days"
  deadline honored — last task ≤ today+5d, D2 ✓), C02/C07/C10 big_task ✓
  (C07 "next month" sized ≤ today+30d ✓), C03/C04/C05 direct zones ✓,
  C06 narrate ✓, **C08 direct_zone:fishboat** (precedence intact) with goal
  "organize a week of revision" — no zone word (D3 ✓), **C09 big_task, goal
  "understand photosynthesis and drill flashcards"** (D4 ✓). Tasks are
  topic-specific everywhere (D5 ✓). Live roadmap narration: per-step,
  ≤2 sentences, warm, on-target (F5 ✓).
- **Live upload run** (`.scratch/p1-verify/eval_live.py uploads`, real
  OpenRouter, **8/8 PASS**): biology PDF → deck of **8 cards** + valid `.apkg`
  zip served at `apkgUrl`; cs PDF → 12 nodes/10 links; history PDF →
  11 nodes/9 links; atlas grew to 23 nodes. No `fallbackUsed` anywhere.
- **Retention (B5):** nothing persists document text — `IngestedDocument` is
  request-scoped; only cards(+snippets)/graph/plans hit Postgres. Card
  snippets verified ≤200 chars verbatim in `tests/test_generate.py` (C3 ✓).

## Decisions / deviations the monitor must ratify

1. **Concurrent-test-DB hazard FIXED at the root.** A zombie pytest process
   from a timed-out run kept dropping/recreating the shared `harbour_test`
   under my suite mid-flight (observed live as flaky
   `ForeignKeyViolationError` / `ConnectionDoesNotExistError`).
   `tests/conftest.py` now uses a **per-process** database
   `harbour_test_<pid>`, dropped at session end. Deviates from session 014's
   "dedicated harbour_test" naming — ratify or revert.
2. **Supervisor trigger extended beyond the handoff's literal "0 zones".**
   The handoff said "0 zones hit and not pure chitchat — this fixes D4", but
   D4's C09 hits ONE zone. Trigger is: (0 zones & not chitchat) OR (1 zone &
   ≥3 residual non-zone, non-filler words). The supervisor prompt encodes
   FR-0.2 precedence (zone's-own-function stays direct_zone — C08 verified
   live) while separate learning goals upgrade to big_task (C09 verified).
3. **SupervisorDecision schema relaxed after live failure:** real models
   attach a zone hint to `big_task` (C08 first run 502'd on my
   over-strict validator). Zone on non-direct_zone is now a logged hint,
   dropped (pipeline covers all zones). direct_zone still requires a zone.
4. **`.apkg` export failure surfacing (handoff §3.6):** deck persists (cards
   are primary); failure = ERROR log + SSE `error` event, `apkgUrl` null.
5. **pydantic 2.9.2 → 2.13.5** (pinned): docling crashes on pydantic <2.10
   (`force_full_page_ocr` AttributeError). Suite re-verified green after.
6. **`py-fsrs` is `fsrs` on PyPI** (6.3.2 pinned). Legacy-data rule: stored
   state with `stability: null` (P0-written grades) is scheduled as a NEW
   card — the only honest reading; documented in `fsrs_state.py`.
7. **`fsrs` JSONB carries extra keys** (`step`, `lastReview`) alongside the
   canonical five; `FsrsState.model_validate` ignores extras at the boundary.
   `app/schemas.py` is untouched (frozen contract kept; endpoint payload
   models live in agent modules, mirroring the review.py precedent).
8. KG node ids are `{slug}-{sha1(user)[:8]}` — `kg_nodes.id` is a global PK
   while merge is per-user (root-caused via a test-order IntegrityError).
9. **kg `deckIds`/`taskIds` stay empty on document builds** — §4.5 retention
   discards document lineage, so no attribution survives to link. Documented
   in code; if the monitor wants linkage, that needs a schema/flow decision.

## Known cosmetics / notes (not defects)

- The LLM HTML-escapes `>` inside copied snippets (`-&gt;`), so a snippet can
  differ from source bytes by entity escaping; still traceable (C3).
- First Docling/KeyBERT use downloads HF models (one-time cache). KeyBERT
  fallback test needs network on first run.
- `.env.example` still warns "must be a vision-capable model" — stale per
  locked decision 1 (Docling→text). Root file, outside my write scope —
  monitor to update.
- REQUIREMENTS.md P1 checkmarks: untouched (monitor approves per handoff §5.7).

## FE coordination (their side, flagged per handoff §7)

- H1: upload UI for `POST /agents/flashcards/generate` (multipart `file` +
  form `deck_name`) and `POST /agents/kg/build` (multipart `file`).
- H2: §7.3 one-time OpenRouter notice before first upload.
- H3: wire `AtlasLayer` to `GET /agents/kg/graph` (still static fixture).
- H4: FE build fix (`SmallBoat.tsx` signature) — theirs.
- New error envelopes the FE will see: `DOCUMENT_UNSUPPORTED` (415),
  `DOCUMENT_TOO_LARGE` (413), `DOCUMENT_EMPTY` (422),
  `DOCUMENT_PARSE_FAILED` (422), `KG_EXTRACTION_FAILED` (502),
  `LLM_UNAVAILABLE` (502) — all with SSE `error` companions on workflow
  failure. kg/build success may carry `fallbackUsed: "keybert"`.

## State at end of session

- Backend suite green (final numbers in "Verified by execution"), ruff+mypy
  clean; alembic clean; no migration 002 needed.
- Dev DB `harbour` was cleaned of all `eval-%` user rows after the live
  runs (FK-safe deletes); the seeded world is intact.
- Scratch evidence (gitignored): `Backend/.scratch/p1-verify/`.
- No git commands run (monitor commits). No frontend files touched.
