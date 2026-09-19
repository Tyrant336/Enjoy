# Handoff — Agent S (Support). You are the fresh S. Read this FIRST.

## Your role + ownership

Support agent: seeds/fixtures, test harness, E2E gates, coverage, NFR-2
palette checks, devops, unblocker. **Never start features; never edit another
agent's zone.** T = 3D world (frontend/components/**, lib/atlas/**, theme.ts,
worldApi.ts implementation). L = logic (Backend/app/**, seed.py, FE non-3D).

**You may write:** `Backend/tests/**` · `Backend/scripts/**` (fixtures,
export, seed_dates, no_red_check — NOT seed.py, that's L's) ·
`frontend/lib/fixtures/**` · `docs/` · `Backend/pyproject.toml` (dev deps
only, pinned) · `Backend/README.md` (monitor-approved chore) · palette-check
script (yours: `Backend/scripts/no_red_check.py`).

**Frozen — never touch:** `Backend/app/schemas.py`, `frontend/lib/types.ts`,
`frontend/lib/worldApi.ts` signatures (frozen at Checkpoint 1; changes only
via monitor).

## Read-first (in order)

1. `AGENTS.md` — §2 fail loudly, §3.4 NO REALITY MODES, §6 testing (≥90%,
   real assertions, real Postgres, no mock theatre), §8 docs rules.
2. `docs/REQUIREMENTS.md` — §4.6 seed fixture · §5 contracts · §5.3 WorldEvent
   · FR-0/1/2 (routing/planner/review rules) · NFR-2 no-red · §8 demo script.
3. `docs/BUILDING.md` — §3 phases (S rows).
4. Your session files: `docs/sessions/014` (fixtures+harness) · `015`
   (live_server SSE fix) · `017` (NFR-2 + coverage gate) · `018` (gate flips +
   coverage rescue + open items). Latest = ground truth.
5. `docs/PHASE3-E2E-CHECKLIST.md` (browser halves you staged).

## VERIFIED state (evidence, not claims)

- **Suite: 130 passed, 2 skipped, 1 xfailed; coverage 97.66% with
  `--cov-fail-under=90` enforced** (pyproject addopts). Run:
  `cd Backend && .venv/Scripts/python.exe -m pytest` (~30 s).
- §4.6 canonical fixture `Backend/scripts/fixtures/seed_data.json` (48 nodes/
  96 edges/avg degree 4.0; NOW/TODAY tokens; resolver
  `scripts/seed_dates.py` — THE one, imported by L's seed.py). Validator:
  `tests/test_seed_fixture.py`. FE export: `scripts/export_atlas_fixture.py`
  → `frontend/lib/fixtures/atlas-seed.json` (deterministic, sha-verified).
- Seed loader works end-to-end (L fixed FK flush order): `python -m
  scripts.seed` → 4 tasks/2 decks/3 cards/48 nodes/96 edges/4 records/1 event.
- E2E `tests/test_e2e_demo.py`: §8.1–8.6 + §8.8 all LIVE and green; only the
  two §8.7 browser-half stubs skip (point to the Phase 3 checklist).
- Harness `tests/conftest.py`: fresh `harbour_test` DB per session, real
  `alembic upgrade head`; fixtures `client` (ASGI), `live_client` (REAL
  uvicorn — mandatory for SSE), `db_session`, `seeded_user_id`.
- NFR-2: `scripts/no_red_check.py` + `tests/test_no_red.py` (16 tests incl.
  proven negatives); CLI `python scripts/no_red_check.py` exit 1 on red.
- ruff/mypy clean for ALL S-owned files. **L currently red:** ruff ∪ docstring
  char in `app/services/review_session.py:11`; mypy 13 errors in
  `tests/test_chat_tours.py` (2) + `tests/test_review.py` (11) — reported to
  monitor, NOT yours to fix unless routed.

## IN-FLIGHT / next in queue

1. **xfail to watch:** `tests/test_router.py::test_fat_boat_is_the_fishboat`
   (strict xfail — "fat boat" misroutes to big_task; L owns the fix in
   `app/agents/orchestrator/router.py`; when it XPASSes the suite goes red
   deliberately → remove the marker).
2. Monitor routes new work; expected Phase 2/3 S items: keep E2E green as L
   lands more, BE unit tests for any new deterministic cores, Phase 3
   checklist support, `Backend/README` chores, possible Playwright decision
   for browser E2E (monitor's call).
3. `.scratch/` (L's curl artifacts) — monitor will gitignore; don't delete.

## GOTCHAS (each cost real time — don't rediscover)

- **Ports:** FE 3000 · BE 8000 · DB **5433** (5432 = native Windows PG; Docker
  `enjoy-db` on 5433). `docker compose up -d db` first.
- **No git commands ever** — monitor commits at checkpoints.
- **NO DEMO MODE (§3.4):** one runtime path; `OPENROUTER_API_KEY` +
  `DATABASE_URL` required, missing = startup crash. Seed data is test data,
  never a mode.
- **Never run two pytest suites concurrently** — session fixture
  drops/recreates `harbour_test`; a second run causes "users does not exist"
  mid-flight. Killed runs leave orphan python processes holding the DB —
  check `ps -W | grep enjoy` and kill them.
- **SQLAlchemy `str(URL)` masks the password (`***`)** — use
  `url.render_as_string(hide_password=False)` (bit me in conftest).
- **ASGITransport cannot test SSE** (awaits the ASGI app to completion;
  infinite stream = hang). Use `live_client`/`live_server` for
  `/api/events`. httpx default 5 s timeout is your hang-guard.
- **httpx/pytest-cov/uvicorn pinned** in pyproject dev group; install:
  `uv pip install --python .venv/Scripts/python.exe <pin>`.
- **Ruff hates ambiguous unicode** (RUF001/2/3): en-dash `–`, `×`, `∪` in
  code/comments/strings. Use hyphens. Em-dash `—` and box chars are OK.
  Console shows mojibake (cp950) — files are fine, don't "fix" the mojibake.
- **E501 limit 90.** **mypy strict** — annotate everything; Pydantic
  datetimes need `datetime`, not str.
- **db_session identity-map staleness:** after the API mutates rows you
  inserted via db_session, `await db_session.refresh(row)` before asserting.
- **E2E mutations:** always FRESH user (`uuid`) + own deck — never mutate
  `user-seed-01` (other tests assert its pristine state).
- **`seeded_user_id` = "user-seed-01"** (session-scoped seed run).
- Contract `Record` shadows TS built-in — FE uses `globalThis.Record`.
- Docs live in `docs/` only; session file per session (next number after 018,
  check for collisions — 010/011 each have two files).
- Windows paths: run pytest/ruff/mypy from `Backend/` with
  `.venv/Scripts/python.exe`; uv is at anaconda3/Scripts.

## Rule set (how you work)

Fail loudly (§2): no silent fallbacks, no swallowed exceptions, no mock data
outside fixtures. One way/one path (§3). Verify everything by execution and
report exactly what ran (command + output); never claim unverified state.
Real assertions over coverage theatre. Small atomic diffs in YOUR zones only.
Ambiguity → record in a session file and continue doc-faithfully; cross-zone
needs → report to the monitor, never work around. Monitor reviews at
checkpoints. When idle: session file, report, wait.
