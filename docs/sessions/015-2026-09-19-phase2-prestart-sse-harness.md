# Session 015 — S pre-starts Phase 2 (E2E skeleton) + SSE harness fix

- Date: 2026-09-19
- Role: Agent S (Support) — BUILDING.md §3; monitor asked "what's next / start
  early" while T and L finish Phase 1.

## Goal

Revise the build plan with S's next work, and start the parts of S's Phase 2
assignment that don't depend on unwritten code: the §8 E2E skeleton and
coverage tests. Continue the support mandate: unblock L wherever possible.

## What was done (all verified by execution)

1. **BUILDING.md revised** (monitor-requested): Phase 1 Agent S bullet marked
   ✅ DONE (session 014); Phase 2 Agent S bullet annotated — E2E skeleton +
   coverage tests pre-started now; planner/scheduling unit tests stay in
   Phase 2 (they need L's planner code to exist first). Monitor's concurrent
   24-hour timeline edit preserved.
2. **E2E skeleton** — `Backend/tests/test_e2e_demo.py`: REQUIREMENTS §8 demo
   script as tests. Runnable NOW: §8.1 seeded harbour state (world-state
   composition: ≥1 circling + ≥1 docked deck, base lamp glow, atlas size),
   §8.5 atlas serves the seeded graph (hard `KnowledgeGraph` validation),
   §8.8 missing `OPENROUTER_API_KEY` → loud `ValidationError` at startup.
   Skip-gated (each naming the endpoint that removes the skip): §8.2 chat/
   tour-offer, §8.3 review loop, §8.4 deck completion, §8.6 direct-zone
   routing — all Phase 2 (Agent L). Visual/FE halves (palette, keyboard,
   dive) explicitly assigned to T/monitor in the file docstring.
3. **Coverage tests for the atlas export** — `Backend/tests/test_export_atlas_fixture.py`:
   export matches fixture graph exactly, is byte-deterministic across runs,
   and the committed FE fixture is in sync RIGHT NOW (drift trips loudly).
   `export_atlas_fixture.py` coverage 0% → 93%.
4. **Verified L's seed-loader fix** — `python -m scripts.seed` against the dev
   DB: tasks 4, decks 2, cards 3, kg_nodes 48, kg_edges 96, records 4,
   event_outbox 1 (verified by the loader's own read-back). The session-014
   blocker is GONE (L fixed the FK flush ordering).
5. **ROOT-CAUSED + FIXED the SSE test hang** (§1.8 — investigated, not
   patched around): the suite hung because `httpx.ASGITransport` awaits the
   ASGI app **to completion** before returning a response — an infinite SSE
   stream (`GET /api/events`) can therefore NEVER be tested in-process.
   Reproduced standalone (stack trace captured). Fix (harness, my zone):
   new `live_server` fixture (real uvicorn on an ephemeral port, in-test,
   with a 10 s startup deadline that raises instead of hanging) +
   `live_client`; L's `test_sse_replays_outbox_in_seq_order` switched
   `client` → `live_client` (minimal diff, tests/** is S's zone, documented
   in the test + conftest docstring). Real HTTP = production-faithful SSE.
6. **Killed an orphaned pytest process** (PID 2493) left by the timed-out
   run — it was still streaming against `harbour_test` and would have
   poisoned later runs. Also set `asyncio_default_fixture_loop_scope =
   "function"` to silence the pytest-asyncio deprecation warning.

## Exit-test evidence (final, this session)

| Test | Result |
|---|---|
| `pytest` (full suite) | **31 passed, 4 skipped in ~7.4 s** (was: 20 passed, 5 errors + hang) |
| `ruff check .` | All checks passed |
| `mypy` | no issues in 28 source files |
| Coverage report | TOTAL **93%** (up from 87%) |
| Seed loader on dev DB | full §4.6 load + read-back verification ✅ |

## Deviations & decisions (monitor attention)

1. **L's SSE test now uses `live_client`, not `client`.** ASGITransport is
   fundamentally incapable of driving infinite SSE; the alternative (making
   the endpoint finite for tests) would be a reality-mode violation (§3.4).
   A real uvicorn per streaming test is the one honest path. `client`
   remains for all non-streaming tests.
2. **Suite state is green but 4 skips are phase gates**, not dead switches —
   each names the Phase 2 endpoint that removes it (see test docstring).
3. **BUILDING.md was edited concurrently by the monitor** (24-hour timeline)
   while I worked — my edit was re-applied against the fresh text; no
   monitor content was overwritten.

## NOT verified / out of scope

- Planner/scheduling unit tests (S, Phase 2) — blocked by design until L's
  template planner exists.
- T's world/AtlasLayer — untouched; `atlas-seed.json` + `worldApi.ts`
  skeleton await them (both ready since session 014).
- No git commands run (monitor handles VCS).

## State at end of session

- Backend suite fully green on real Postgres; SSE testable via live server.
- Seed pipeline works end-to-end: fixture → resolver → loader → API → SSE.
- S's remaining queue: (a) planner/scheduling unit tests when L's Phase 2
  planner lands; (b) un-skip E2E gates as L's chat/tour/review endpoints
  land; (c) 90% fail-under gate when CI exists (monitor decision pending,
  session 014 §7); (d) standby support for T.
