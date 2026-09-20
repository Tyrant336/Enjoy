# P1 ACCEPTANCE CHECKLIST — monitor-executed, binary PASS/FAIL

> Companion to `docs/handoff/agent-l-p1.md`. **P1 is finished only when every
> row below is PASS, verified by the monitor's own execution** (AGENTS.md §1.2 —
> claims without executed evidence do not count). Run against: real Postgres
> (`harbour` or `harbour_test` per harness), real OpenRouter, the 3 fixture PDFs
> (`Backend/tests/fixtures/*.pdf`).
> Style follows `docs/PHASE3-E2E-CHECKLIST.md`.

## A. Gates & hygiene

| # | Check | Pass condition |
|---|---|---|
| A1 | Full backend suite | green, **0 new skips**, coverage ≥ 90% (gate enforced) |
| A2 | `ruff check .` + `mypy` | clean |
| A3 | Alembic | `upgrade head` + `downgrade base` + `upgrade head` + `alembic check` all clean on a scratch DB |
| A4 | No reality modes | grep: no `DEMO_MODE`, no mock/fixture fallback in live paths, no TODO/stub wired in |
| A5 | Templates killed | old template planner deleted (§3.6); no parallel "v2" code paths anywhere |
| A6 | Docs | `Backend/README.md` runbook true; builder session file exists; P0 suite + session-025 eval re-run still green |

## B. LLM client & ingestion (FR-2.1/FR-3.1, §7.3)

| # | Check | Pass condition |
|---|---|---|
| B1 | One wrapper | `app/core/llm.py` is the ONLY OpenRouter talker (grep proves it) |
| B2 | Structured output | every LLM call Pydantic-validated; garbage-JSON test fails LOUDLY (hard error, payload logged) |
| B3 | Upload validation | wrong extension → §5.2 `DOCUMENT_UNSUPPORTED` envelope; >25 MB rejected; filename sanitized |
| B4 | Corrupt file | loud `DOCUMENT_PARSE_FAILED` envelope — never a partial/garbled result |
| B5 | Retention | no document text persisted; only artifacts + ≤200-char snippets (inspect DB rows) |

## C. Flashcard generation (`POST /agents/flashcards/generate`, FR-2.2/2.3)

| # | Check | Pass condition |
|---|---|---|
| C1 | biology PDF → deck | real upload returns `Deck` + cards persisted in Postgres; `spawn_boat` SSE event emitted |
| C2 | Card rules | one concept/card; question ≤25 words; answer ≤40 words — verified on generated output |
| C3 | Source snippets | each card has a ≤200-char snippet traceable to the source PDF |
| C4 | `.apkg` | file exists at `apkgUrl` and opens (genanki output valid) |
| C5 | OpenRouter down (mock HTTP boundary) | §5.2 envelope + SSE `error` — never canned cards |

## D. KG generation (`POST /agents/kg/build`, FR-3.2/3.3)

| # | Check | Pass condition |
|---|---|---|
| D1 | cs PDF → graph delta | nodes/edges persisted to `kg_nodes`/`kg_edges`; only allowed node/edge types |
| D2 | Merge/dedupe | re-build with overlapping doc → normalized-label merge, no duplicate nodes |
| D3 | KeyBERT fallback | forced LLM failure → `fallbackUsed: "keybert"` in response + WARNING log |
| D4 | Atlas grows | `GET /agents/kg/graph` node/edge counts increase after build |
| D5 | History PDF | third fixture also builds (proves generality, not fixture-tuned) |

## E. FSRS (FR-2.8 P1)

| # | Check | Pass condition |
|---|---|---|
| E1 | Real FSRS | py-fsrs drives scheduling; per-card state in `flashcards.fsrs` JSONB survives restart |
| E2 | Contract intact | `again|hard|good|easy` API unchanged; FR-2.9 once-per-session rule intact; existing review tests updated and green |

## F. Scheduler & Orchestrator LLM upgrade (FR-1.5/FR-0.3 P1, fixes D1–D5)

| # | Check | Pass condition |
|---|---|---|
| F1 | Real breakdown | "I'm overwhelmed — calculus exam in 5 days" → `StudyPlan` with topic-SPECIFIC tasks (not Mad-Libs), goal cleaned (no "I'm overwhelmed", no zone words) |
| F2 | Date parsing | "in 5 days" → deadline resolved (seed_dates logic) and schedule sized to it |
| F3 | Ambiguity | "help me understand photosynthesis and drill my flashcards" → LLM supervisor routes sensibly; topic not dropped (D4) |
| F4 | Session-025 eval re-run | 10 chat inputs still route correctly; D1/D2/D3/D5 demonstrably fixed |
| F5 | LLM narration | big-task roadmap narration is LLM-generated, ≤2 warm sentences, validates into `Roadmap` |

## G. Golden-path E2E (the new demo)

| # | Check | Pass condition |
|---|---|---|
| G1 | One automated test | upload PDF → deck appears → review + grade one card → graph grew → journal record written — all real, all in one test |
| G2 | P0 regression | `Backend/tests/test_e2e_demo.py` (§8 script) still passes unchanged in behavior |

## H. FE handoff readiness (flagged, not built by BE agent)

| # | Item | Status |
|---|---|---|
| H1 | Upload UI for both multipart endpoints | FE agent |
| H2 | §7.3 one-time OpenRouter notice | FE agent |
| H3 | AtlasLayer wired to `GET /agents/kg/graph` | FE agent |
| H4 | FE build fixed (`ReviewMode`/`SmallBoat` signature) | FE agent |
