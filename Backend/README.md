# Backend — enjoy (Harbour of Learning)

FastAPI + SQLAlchemy 2.x (async) + asyncpg + Alembic + PostgreSQL.
Rules: `../AGENTS.md` · Product contract: `../docs/REQUIREMENTS.md`.

## Environment

- **Python:** 3.12.7, virtualenv managed with **`uv`** (`uv venv`). One venv, one
  way — do not create a second one with `python -m venv`.
- **Database:** PostgreSQL 16 via Docker at the repo root:
  `docker compose up -d db` → container `enjoy-db`, **host port 5433**
  (5432 is taken by a native Windows PostgreSQL service on this machine —
  see `docs/sessions/010-2026-09-19-phase0-scaffold.md`).
- **Config:** env vars from the **repo-root `.env`** (copy from `.env.example`).
  `DATABASE_URL` and `OPENROUTER_API_KEY` are both **required** — the app crashes
  at startup without them (by design; NO demo mode, REQUIREMENTS §4.2).

## Setup (from `Backend/`)

```bash
uv venv .venv
uv pip install --python .venv/Scripts/python.exe -e .
uv pip install --python .venv/Scripts/python.exe pytest==8.3.4 pytest-asyncio==0.24.0 pytest-cov==6.0.0 httpx==0.28.1 ruff==0.8.4 mypy==1.13.0
```

(Windows paths shown; on Unix use `.venv/bin/python`.)

## Run

All commands from `Backend/` with the venv python:

```bash
# Database migrations (Alembic owns the schema — never CREATE TABLE in app code)
.venv/Scripts/python.exe -m alembic upgrade head      # apply
.venv/Scripts/python.exe -m alembic downgrade base    # full rollback (must always work)

# API server (single worker — SSE lives in-process, BUILDING.md §1.5)
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
# → GET http://127.0.0.1:8000/health → {"status":"ok"}

# Tests (see "Testing" below — real Postgres, coverage gate ≥90%)
.venv/Scripts/python.exe -m pytest

# NFR-2 no-red palette check (also runs inside pytest; exit 1 = red found)
.venv/Scripts/python.exe scripts/no_red_check.py

# Lint / typecheck (AGENTS.md §9 gate — must be clean)
.venv/Scripts/python.exe -m ruff check .
.venv/Scripts/python.exe -m mypy
```

## Layout

```
app/
  main.py          # FastAPI app factory, CORS, /health, error handlers, routers
  schemas.py       # FROZEN contract — REQUIREMENTS §5.1/§5.2 verbatim (mirror: frontend/lib/types.ts)
  models.py        # ORM models — mirror migration 001 EXACTLY (`alembic check` must stay empty)
  core/
    config.py      # Settings (env / repo-root .env); crashes if DATABASE_URL missing
    db.py          # async engine + session factory (the ONLY one)
    errors.py      # AppError + handlers → §5.2 error envelope (never raw framework errors)
  api/
    deps.py        # identity: X-Harbour-User-Id upsert + X-Harbour-Timezone (§4.4)
    world.py       # GET /api/world-state · /api/records · /api/events (SSE outbox)
    agents.py      # GET /agents/kg/graph · /agents/flashcards/today
  services/
    world_state.py # read assembly → canonical contracts (due-today, lamp glow, …)
alembic/
  env.py           # async env; URL from app settings; target_metadata wired for `alembic check`
  versions/        # 001_initial_schema.py … zero-padded, linear chain, real downgrade()
scripts/
  seed.py          # THE ONLY seed loader — wipe + re-seed the fixture user (idempotent)
  seed_dates.py    # THE one relative-date-token resolver (Agent S) — used by seed.py
  export_atlas_fixture.py # §4.6 graph → frontend/lib/fixtures/atlas-seed.json (anti-drift)
  no_red_check.py  # NFR-2 no-red palette checker (theme tokens + cluster palette)
  fixtures/
    seed_data.json # THE ONLY seed content (Agent S, canonical §4.6 fixture)
tests/               # pytest (asyncio_mode=auto); real Postgres `harbour_test` per session

## Testing (AGENTS.md §6)

- **Real Postgres, never SQLite:** the suite creates a fresh `harbour_test`
  database per session and migrates it with `alembic upgrade head`
  (`tests/conftest.py`). Fixtures: `client` (in-process ASGI), `live_client`
  (REAL in-test uvicorn — required for SSE; ASGITransport cannot drive
  infinite streams, docs/sessions/015), `db_session`, `seeded_user_id`.
- **Coverage gate: ≥90% enforced on every run** (`--cov-fail-under=90` in
  `pyproject.toml`; monitor decision, session 017).
- `tests/test_e2e_demo.py` is the §8 demo script as tests; skip-gates flip
  live as Phase 2 endpoints land. Browser-level halves (keyboard,
  reduced-motion): `../docs/PHASE3-E2E-CHECKLIST.md`.
```

## Seeding (deliberate, idempotent — test data, not a mode; AGENTS.md §2.3/§3.4)

```bash
.venv/Scripts/python.exe -m scripts.seed     # safe to run repeatedly
```

Wipes + re-seeds ONLY the fixture user (`user.id` from `seed_data.json`) in one
transaction; other users are untouched. Dates in the fixture are relative-to-now
tokens (`NOW-3d`, `TODAY+1d`) resolved at seed-run by `scripts/seed_dates.py`.
Missing/invalid fixture = loud crash — the loader never invents data. Also writes
one seeded `narrate` WorldEvent (`seq=1`, id `evt-seed-narrate-01`) into
`event_outbox` so `GET /api/events` has something to stream.

## Adding a migration

1. Check `alembic/versions/` — next number is `max(existing) + 1`, zero-padded.
2. Hand-write `00N_slug.py` with `revision = "00N"`, `down_revision` = previous,
   and a real `downgrade()`.
3. Verify: `alembic upgrade head` **and** `alembic downgrade base` on the real
   Postgres. A non-reversible migration is a failed migration.
