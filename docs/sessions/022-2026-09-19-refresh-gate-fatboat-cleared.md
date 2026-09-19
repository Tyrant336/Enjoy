# Session 022 — S: refresh-during-review E2E gate, fat-boat xfail cleared

- Date: 2026-09-19
- Role: Agent S (Support). Monitor queue: new Phase 3 backend gate test ·
  puppeteer-vs-Playwright recommendation · fat-boat xfail watch · green suite.
- `git pull` (monitor-instructed): already at 09fcee9 (contract amendment —
  `WorldApi.syncFromWorldState`, session 020).

## What was done (verified by execution)

1. **NEW E2E test** — `tests/test_e2e_demo.py::
   test_refresh_mid_review_world_state_rebuilds_session`: the backend half of
   Checkpoint 3's refresh-during-review gate (checklist A10). Fresh user + own
   3-card deck (never touches user-seed-01); start review, grade 1 card, then
   a fresh-client `GET /api/world-state` asserts:
   - `WorldState.model_validate` parses the raw payload (the exact contract
     `worldApi.syncFromWorldState` consumes, §2.4 boundary);
   - `reviewing.deckId` + `currentCard.id == c2` (resume position = next
     ungraded, FR-2.9) + `answerRevealed == False`;
   - the deck row's `boatState == "reviewing"`;
   - `lastEventSeq` equals the outbox high-water mark read from the real DB
     (the SSE gap anchor);
   - sufficiency proven by behavior: a post-refresh `review/start` resumes on
     exactly that card with progress (1 graded / 2 remaining).
2. **Fat-boat xfail REMOVED** — the strict-xfail tripwire fired: full suite
   went red with `[XPASS(strict)] test_fat_boat_is_the_fishboat`. Verified the
   fix is genuinely in the working tree (`router.py`: phrase-level "fat boat"
   / "big boat" in the fishboat keyword set + a precedence comment — L's zone,
   uncommitted, NOT touched by me). Marker deleted, test now a normal pass.
   This was the pre-assigned watch item (handoff queue 1).
3. **Suite re-run, final:** **132 passed, 2 skipped, coverage 97.67%**
   (gate ≥90 enforced). ruff clean (tests/ + scripts/), mypy clean (48 files),
   FE `tsc --noEmit` exit 0.

## LOUD WARNING — concurrent pytest collisions (recurred, session 018 gotcha)

Mid-session the full suite flaked twice with *different* seed-dependent
failures each run (`started["card"] is None` on the seeded deck, boat-state
counts, a SQLAlchemy error mid-E2E). Root cause identified, not patched over:
**another agent session was running pytest against the same fixed-name
`harbour_test` DB concurrently** (the session fixture drop/recreates it;
`git status` shows T and L actively working in the tree). No Backend venv
python orphans existed. The suite is deterministic when run solo — final
solo run is green above. Monitor: consider serializing test runs across
agent sessions, or a per-run DB name suffix, before Phase 3's parallel work.

## Browser-E2E recommendation (monitor decision)

**Pick puppeteer-core.** Every Phase 3 checklist item (keyboard-only review,
camera timing, reduced-motion emulation, backend-down error states, refresh
recovery, screenshots) is servable by a small puppeteer-core script against
the system Edge/Chrome — and 25.11.0 is already in `frontend/node_modules`,
so zero install/download in a 24-hour hackathon, versus Playwright's browser
downloads + new config surface for what is a ~20-row, largely one-shot
checklist. Caveat: puppeteer-core is currently a **transitive** dep (not in
`package.json`) — if approved, it must be pinned in `devDependencies` first
(needs your sign-off; `frontend/package.json` is outside my zone). If the
suite is expected to outlive the hackathon, Playwright's runner is the better
long-term home — but that is not this week's problem.

## NOT verified / pending

- The 2 remaining skips are the browser-half §8.7 gates — awaiting the
  monitor's tooling decision above.
- T/L working-tree changes (worldStore, worldBus, CameraRig, router.py) are
  uncommitted; my suite-green claim covers the tree as it stands now.
- No git mutations by me (the pull was monitor-instructed).
