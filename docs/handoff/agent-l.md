# HANDOFF — Agent L (Logic), Phase 2 → fresh agent

> Written 2026-09-19 ~15:45 after the monitor's context-handoff request.
> You are the fresh **Agent L** for the "enjoy" hackathon project
> (`C:\Users\lsu22\enjoy`). This file IS your continuation prompt.

## 1. Role + ownership

**Agent L — Logic:** backend agents + API + DB logic, plus non-3D frontend wiring.

**You may write:** `Backend/**` (EXCEPT `app/schemas.py` — FROZEN contract, and
existing `alembic/versions/001*` — append-only; new migrations only as new files)
· `frontend/lib/worldBus.ts` · `frontend/components/ui/**`.

**Never touch:** T's zones (`frontend/components/world/**`, `components/underwater/**`,
`lib/atlas/**`, `lib/theme.ts`, `lib/worldApi.ts` — you CONSUME its frozen
signatures), `frontend/app/page.tsx`/`layout.tsx`/`globals.css` (monitor wires in
Phase 3 — you deliver COMPONENTS, not pages), `frontend/lib/types.ts` (frozen mirror).

**No git commands, ever** — the monitor commits/branches/merges.

## 2. Read-first list (in order — they are law)

1. `AGENTS.md` (root) — §2 fail-loudly, §3 one-path, §3.4 NO REALITY MODES,
   §5 Postgres+Alembic strict, §6 testing, §8 docs rules.
2. `docs/REQUIREMENTS.md` v2.1 — §4.2 (locked decisions), §4.4 (identity/tz),
   §4.6 (fixtures), §5 (contracts; §5.3 event ordering + same-transaction rule),
   FR-0/1/2/5 (esp. FR-2.8 P0 intervals, FR-2.9 session rule), §7.1 no-pressure.
3. `docs/BUILDING.md` §2 (zones) §3 Phase 2.
4. Session files: **013** (Phase 1 logic — models/seed/endpoints/SSE + SQLAlchemy
   FK-flush lesson), **015** (S's live_server SSE harness + E2E skip gates),
   **012** (T's world), **014** (S support). Session 016 (my Phase 2 file) is
   NOT yet written — writing it is part of your queue (see §5).
5. `Backend/README.md` (runbook), `frontend/AGENTS.md` (Next 16 ≠ training data;
   check `node_modules/next/dist/docs/` before Next assumptions).
6. Frozen contracts: `Backend/app/schemas.py`, `frontend/lib/types.ts`,
   `frontend/lib/worldApi.ts` (signatures frozen — consume only).

## 3. VERIFIED state (evidence, no claims without it)

**Phase 1 (complete, monitor-verified):** 11 ORM models == migration 001
(`alembic check` empty); idempotent `scripts/seed.py` (wipe+re-seed fixture user
`user-seed-01`, runs twice clean); endpoints `/api/world-state`, `/api/records`,
`/agents/kg/graph`, `/agents/flashcards/today`, SSE `/api/events`; §5.2 error
envelope everywhere. Session 013 has the full evidence table.

**Phase 2 backend (complete & GREEN — final verify 15:44):**
- **108 passed, 2 skipped, coverage 97.42%** (≥90 gate met), `ruff` ✅ `mypy` (44 files) ✅.
- Pre-router `app/agents/orchestrator/router.py` (FR-0.3; direct-zone/big-task/chitchat).
- Template planner `app/agents/scheduler/planner.py` (FR-1.5 P0, spice 1–5) +
  `service.py` (`POST /agents/scheduler/plan`, `tasks/{id}/complete` idempotent).
- Chat `app/agents/orchestrator/service.py` (`POST /api/chat`; big task → plan +
  roadmap + tour_offer; direct zone → one agent, no tour; chitchat → narrate).
- Review `app/agents/flashcards/review.py` + derivation in
  `app/services/review_session.py` (FR-2.8 fixed intervals, FR-2.9 session rule,
  session derived from review_events + records, no extra table).
  **`POST /agents/flashcards/review/start` is a DOCUMENTED DEVIATION** (proposed
  contract amendment — §5.2 has no session-start call; mirrors exit's {deckId};
  monitor must ratify). reveal/grade/exit are exactly per contract.
- Tours `app/api/chat.py` (start/dismiss/replay; dismiss emits tour_end).
- Outbox `app/services/outbox.py` — same-txn emission, per-user seq via
  `SELECT … FOR UPDATE` on the users row.
- world-state now derives `pendingTour` (event log) + `reviewing` (boat_state).
- Curl journey verified live (session evidence in chat above + `Backend/.scratch/`):
  big-task chat → tour_offer; start → tour_start; SSE seq ascending; 3 grades →
  `sink_boat→rise_boat` ×2 then `sink_boat→dock_at_lamp→lamp_glow`; world-state
  docked + record + glow 0.5; direct-zone "fishboat" → no tour_offer.
- Unit tests: `tests/test_router.py`, `tests/test_planner.py`; integration:
  `tests/test_review.py`, `tests/test_chat_tours.py` (15 tests, all green).

**Phase 2 frontend (IN PROGRESS — 4 of 9 files done, `tsc --noEmit` exit 0):**
- ✅ `frontend/lib/worldBus.ts` — SSE client (fetch streaming w/ identity headers,
  seq-ordered idempotent dispatch to WorldApi, gap/reconnect → refetch world-state).
- ✅ `frontend/components/ui/identity.ts` — localStorage `harbour_user_id` UUID + IANA tz.
- ✅ `frontend/components/ui/api.ts` — `harbourFetch` (headers + envelope errors).
- ✅ `frontend/components/ui/uiStore.ts` — zustand UI store (transcript, tourOfferId,
  lastRoadmapId, tourActive, errorMessage, offline, worldState, busConnected, taskSheetOpen).
- ⬜ NOT STARTED: `UserBootstrap.tsx`, `ChatPanel.tsx`, `TourUI.tsx`,
  `TaskSheet.tsx`, `Banners.tsx` (specs in my monitor task — see §5).

## 4. IN-FLIGHT / exact next tasks (your queue, in order)

1. **Write the 5 remaining UI components** (`frontend/components/ui/`):
   - `UserBootstrap.tsx` — client comp; on mount: getHarbourIdentity → fetch
     world-state into uiStore; if a real WorldApi is available, start WorldBus
     (do NOT start it with the throwing skeleton stub from lib/worldApi.ts).
   - `ChatPanel.tsx` — input + transcript (narration = accessibility transcript
     §7.4); POST /api/chat; append ack as narrator line ONLY if bus not
     connected (dedupe vs narrate events); intercept "labels off/on|hide|show
     labels" LOCALLY → `useWorldStore.getState().toggleLabels()` (consume T's
     store; §5.3 has no label-toggle event — documented deviation).
   - `TourUI.tsx` — non-blocking offer [Begin tour][Not now] (POST
     /api/tours/{id}/start|dismiss); always-visible "?" replay (POST replay w/
     lastRoadmapId); visible "Skip tour" while tourActive (POST dismiss — emits
     tour_end; documented).
   - `TaskSheet.tsx` — FR-1.6: centered compact cream sheet, empathy line +
     today's tasks (scheduledFor == today in user tz), "Done" per task (POST
     complete → refetch world-state), gentle strike-through, Close/"Return to
     harbour" + Esc, all-done line "Today's sea is calm. You did enough."
   - `Banners.tsx` — soft-amber error banner (uiStore.errorMessage, dismissible)
     + offline "The harbour mist is thick — reconnecting…" (uiStore.offline).
   - Style: Tailwind classes only (never edit globals.css); palette from
     `@/lib/theme` (PALETTE/LABEL/MOTION); cream `#EDEDDD` pills, navy `#1A203B`
     text, soft-amber errors, teal pulse loading; NO red, no dashboards,
     no pressure mechanics (§7).
2. **Verify FE:** `./node_modules/.bin/tsc --noEmit` clean + `npm run lint`.
3. **Re-run the full curl journey** for the session-file evidence (server was
   stopped for handoff; `docker compose up -d db`, seed, uvicorn, journey).
4. **Write `docs/sessions/016-2026-09-19-phase2-logic.md`** (goal, done,
   verified-by-execution output, deviations — esp. review/start amendment +
   labels-chat-command local handling + Skip-tour=dismiss — NOT-verified list),
   update `Backend/README.md` layout if needed, then report to monitor.
5. Optional cleanup: `Backend/.scratch/` (my journey JSONs) may be deleted.

## 5. GOTCHAS (each cost real time — don't rediscover)

- **Ports:** FE 3000 · BE 8000 (single worker!) · DB host **5433** (5432 = native
  Windows PG). `docker compose up -d db` from repo root.
- **Orphaned processes:** background task timeouts kill the wrapper, NOT the
  child — stale uvicorns on :8000 bit me 3×. Check `netstat -ano | grep :8000`
  before starting; `taskkill //PID <pid> //F` stale ones serving old code.
- **SQLAlchemy 2.0.36 UOW does NOT order inserts by table-level FKs** (no
  relationships defined) — flush in FK tiers (user → plan/deck → tasks/cards →
  rest) in every multi-entity write. See scripts/seed.py + session 013.
- **sse-starlette `AppStatus.should_exit_event` is a process-global bound to the
  first event loop** — conftest's live_server resets it to None in teardown (I
  added that; without it the 2nd+ SSE test crashes "bound to a different loop").
- **`harbour_test` is a shared mutable DB** — only ONE agent may run the BE
  suite at a time; concurrent runs cause transient `UndefinedTableError`
  (diagnosed in session 013; monitor notified). If you see it, check for other
  agents' pytest processes before suspecting code.
- **EventSource can't set headers** — worldBus uses fetch streaming (do not
  "simplify" back to EventSource; X-Harbour-User-Id is mandatory).
- **Windows console cp950 mojibake** — `—`/`§` render as garbage in console;
  files are UTF-8 and correct. Always `open(..., encoding="utf-8")` in Python.
- **bash `/tmp` ≠ Windows python `/tmp`** — curl `-o /tmp/x` then python
  `open('/tmp/x')` fails; use a project scratch dir.
- **Coverage needs `concurrency=["greenlet"]`** (set in pyproject) or
  SQLAlchemy-await lines report false misses.
- **S's E2E skip-gates** (`tests/test_e2e_demo.py`) un-skip as endpoints land —
  S owns that file; 2 skips remained at handoff (check with `-rs`).
- **CameraPreset union has no "lamp"** — lamp tour steps use target "lamp" +
  preset "overview" (contract-frozen; T extends locally in worldStore).
- **tzdata==2025.2 is required** for IANA tz on Windows (zoneinfo crashes without).
- **Narrate route exists** in the pre-router for chitchat ("hi") — P0 stand-in
  for the P1 LLM fallback; never generate a plan for greetings.
- **Dev DB state:** seeded (user-seed-01) + one real fishboat-chat plan.
  Re-seed (`python -m scripts.seed`) to reset — it wipes ONLY the fixture user.
- Monitor directives at handoff: T → endline/camera/visual-correction then
  review POV; L (you) → coverage gate red + curl-journey tests (both now DONE —
  see §3; remaining queue is §4 above); S → gate-flipping + planner tests +
  coverage rescue.

## 6. Rule set (non-negotiable)

Fail loudly (no silent fallbacks/mock data/reality modes — §3.4 NO DEMO MODE) ·
one way one path (grep before adding abstractions) · typed boundaries (Pydantic/TS,
parse by key) · every mutation + its outbox events in ONE transaction ·
verified-by-execution reporting only ("ran X → output Y") · small increments,
verify each · ambiguity → write it in the session file, continue with the most
doc-faithful option (monitor reviews at checkpoints) · minimal diffs, kill
don't accumulate · update AGENTS.md/README/session file with any change (§8).
