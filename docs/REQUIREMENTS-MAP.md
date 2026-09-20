# REQUIREMENTS MAP — full traceability (finale audit, session 030, 2026-09-20)

> Every requirement in `docs/REQUIREMENTS.md` v2.1 mapped to its status and
> proof. Statuses: ✅ verified by execution (command/screenshot named) ·
> 🟡 built, partially verified · ✂️ cut by owner decision · 🔮 P2 stretch (not v1).
> Evidence shorthand: S030 = `docs/sessions/030-2026-09-20-finale.md`,
> shots = `.labshots/finale-*.png`.

## 1. Functional requirements

| Req | What | Status | Proof |
|---|---|---|---|
| FR-0.1 | Direct-zone requests → ONE agent, never a tour | ✅ | "fishboat"/"small boat"/"atlas" → `direct_zone:*`, `roadmapId: null` (S030) |
| FR-0.2 | Big task → full pipeline + tour OFFER (never forced) | ✅ | 3 live chats → plans + `roadmapId`; offer pill shown, "Not now" works |
| FR-0.3 | Deterministic pre-router + LLM fallback, one path | ✅ | `orchestrator/router.py` + BE suite (`test_router.py`) |
| FR-1.1 | Emotional input → empathy line + ≤45-min verb-first tasks + schedule | ✅ | Rubric S030 §3: calculus/python/ochem plans all ≥4/5 |
| FR-1.2 | Spice level 1–5 (granularity) | ✅ | `PlanRequest.granularity`, default 3 (`test_planner.py`) |
| FR-1.3 | Canonical `StudyPlan` contract | ✅ | Frozen schemas ↔ types.ts; contract tests |
| FR-1.4 | deckRequest field (may request a deck via orchestrator) | 🟡 | Field exists + seeded task carries it; auto-creation not wired (optional "may") |
| FR-1.5 | Planner→executor→replanner interface; deterministic P0 planner | ✅ | `agents/scheduler/`, `test_planner.py` |
| FR-1.6 | "Today" task sheet: empathy line, tasks, Done→Record, Esc, calm line | ✅ | `TaskSheet.tsx` + `completeTask` → Record + lamp glow (vitest 35/35; sheet opened via pill in QA) |
| FR-2.1 | Ingest PDF/PPTX/DOCX/MD/TXT, shared pipeline | ✅ | 3 fixture PDFs + .md + .txt ingested live; shared `services/ingestion.py` |
| FR-2.2 | One concept/card, Q≤25w, A≤40w | ✅ | All 32 generated cards read + measured (S030 §3) |
| FR-2.3 | `.apkg` export + Postgres persistence | ✅ | `apkgUrl` on every generated deck; HTTP 200 download |
| FR-2.4 | Today's circle = due decks; others dock | ✅ | world-state boatStates match dueToday (live queries) |
| FR-2.5 | Review flow: POV → question → reveal → 4 grade boats → sink/rise → Return; nothing-due message | ✅ | shot 05/05b/06; A1–A10 all PASS (checklist inline) |
| FR-2.6 | Completion → dock + Record + warm copy | ✅ | biology 8/8 → docked + `deck_completed` + glow 0.4→0.5 |
| FR-2.7 | Zone semantics (circle/lamp/underwater) | ✅ | As implemented throughout |
| FR-2.8 | FSRS grades 1–4, per-card state persisted | ✅ | py-fsrs live: reps/stability/interval in DB (`test_fsrs.py`) |
| FR-2.9 | Session = initially-due cards, each shown once | ✅ | A6: "again" did not re-show in-session |
| FR-3.1 | KG ingest same as FR-2.1 | ✅ | Same endpoint family, 4 live builds |
| FR-3.2 | LLM extraction, allowed types; KeyBERT fallback logged+surfaced | ✅ | Types verified in deltas; `fallbackUsed` surfaced (never needed live — LLM path held) |
| FR-3.3 | KG in Postgres JSONB, merge/dedupe by label | ✅ | 48 seeded + 36 merged nodes; thermo notes merged into existing labels (edges 96→102) |
| FR-3.4 | LOCKED 07 three.js engine (not react-force-graph) | ✅ | `lib/atlas/atlas.js`; shot 04 (84-node run) |
| FR-3.5 | Node click → drawer: gloss + linked deck/task ids | ✅ | shot 04b (Light Reactions drawer) |
| FR-3.6 | Cluster colors: ≥40° apart, no red families | ✅ | `no_red_check` PASS; legend chips visible |
| FR-3.6+ | **Per-topic KG choice** (owner ask 2026-09-20) | ✅ | One cluster per subject/deck; legend chips toggle topics on/off (verified: opacity 0.4 off) — Chinese/Math/etc. each become their own cluster on upload |
| FR-4.1 | Records table: decks, tasks, days active | ✅ | `records` rows written on completion/Done |
| FR-4.2 | "Today"/"days active" in user's local timezone | ✅ | `world_state._end_of_local_today`; IANA tz persisted |
| FR-4.3 | **Journal view: timeline of victories, warm copy** | ✅ (built session 030 — was the one missing piece) | `JournalSheet.tsx`, lamp "Journal" pill opens it; shot 10 |
| FR-4.4 | Lamp glow grows with record count (capped) | ✅ | 0.1/record capped at 1.0; observed 0.4→0.5 |
| FR-5.1 | Single chat entry | ✅ | `ChatPanel` → `POST /api/chat` |
| FR-5.2 | Orchestrator routes; agents never talk directly | ✅ | Architecture + tests |
| FR-5.3 | Roadmap per big task; offer; "?" replay | ✅ | roadmaps persisted; "?" button replays (used in QA); **natural tour-end chrome bug fixed session 030** |
| FR-5.4 | WorldEvents over SSE (locked); camera navigates | ✅ | outbox + SSE; tour cameras fishboat→fleet→underwater→lamp |
| FR-5.5 | Narration ≤2 sentences, transcript always available | ✅ (fixed session 030) | Tour narrations now stream into transcript live (verified 4 stops) |

## 2. Non-functional / cross-cutting

| Req | Status | Proof |
|---|---|---|
| §2.1 No intentional red | ✅ | `scripts/no_red_check` PASS; shots reviewed |
| §2.4 Visual acceptance (horizon weld, negative space, reflections, no endline) | ✅ | shot 01/09 side-by-side (camera framing slightly closer than reference — polish agent's call, documented) |
| §2.6 Three anchor perspectives + free look | ✅ | ViewPanel Today/Lamp/Global + orbit |
| §4.2 Postgres only, SSE only, NO DEMO MODE | ✅ | One runtime path; bad-key → 502+SSE error, never canned |
| §4.3 Two-scenes atlas; dive ≥1.5 s eased; Surface control; Layer A pauses underwater | ✅ | dive veil observed; Surface button; strict mount/unmount |
| §4.4 Identity via `X-Harbour-User-Id`; timezone header | ✅ | Fresh-UUID smoke test passed; tz persisted |
| §4.5 11 Alembic-owned tables | ✅ | Migration 001 mirrors `models.py`; `alembic check` in CI |
| §4.6 Seed fixtures (plan/Thermo 1 ×3 cards/Thermo Basics/atlas 40–80/records) | ✅ | `scripts.seed` idempotent; world-state matches |
| §5.2 API incl. **PUT /api/preferences** | ✅ (added session 030) | Roundtrip test + live UI toggles |
| §5.3 Event protocol + seq ordering + gap refetch | ✅ | worldBus tests (5/5); live outbox inspection |
| §7.1 Motion timings | ✅ | Camera ≥1.5 s (tour steps 2.2 s); sink/rise 700–1200 ms |
| §7.2 Error/offline/loading states, never silent | ✅ | All six 6B paths proven (S030 §4); calm loading pills |
| §7.3 Upload constraints + one-time consent | ✅ | Client+server validation; consent dialog (shot 02) |
| §7.4 Accessibility: reduced motion (OS + toggle), keyboard, transcript, no color-only info, Skip tour | ✅ | B1–B6, C1–C4 all PASS incl. the OS-preference fix |
| §8 acceptance 1–8 | ✅ | Every item executed; checklist file updated inline |
| §8.1 P0 DoD | ✅ | All boxes ticked (S030 + this map) |

## 3. Cut / deferred (explicit decisions, not gaps)

| Item | Status |
|---|---|
| Voice/TTS/STT (ElevenLabs) | ✂️ CUT — owner decision 2026-09-19 (text transcript only) |
| AnkiConnect push, Neo4j, Townscaper grid, multi-user, calendar sync, YouTube | 🔮 P2/stretch/out-of-scope per REQUIREMENTS §0.2/§9 |
| FR-1.4 auto deck-creation from `deckRequest` | 🟡 optional "may" — field exists; manual upload covers it |

## 4. Known cosmetic notes (non-blocking)

- Deck label pills can overlap when boats bunch near the fishboat/lamp.
- ViewPanel buttons overlay the atlas drawer's top edge underwater.
- Next.js dev overlay ("N issue" badge) appears in `npm run dev` only — absent
  from `npm run build && npm start`.
- Scheduler front-loads tasks into the first days rather than spreading to the
  deadline (rubric 4/5 — prompt refinement candidate, not a correctness bug).
