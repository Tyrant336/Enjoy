# Session 010 — Phase 0 Scaffolding (Agent S)

- Date: 2026-09-19
- Role: Agent S (Scaffolding) — BUILDING.md §3 Phase 0
- Note: monitor's prompt pre-numbered this "008", but 008/009 already exist →
  this file is **010**.

## Goal

Scaffold both ends so Agents T and L can build in parallel: Docker Postgres,
Backend skeleton (FastAPI + async SQLAlchemy + Alembic with all §4.5 entities),
frozen contract type files, frontend 3D deps, lint/type configs. No features,
no business logic, no UI.

## What was done (all verified by execution)

1. **Infra** — `docker compose up -d db` → `enjoy-db` **healthy**.
   `.env` already existed (real `OPENROUTER_API_KEY` present); not touched
   except the port change below.
2. **Backend skeleton** (`Backend/`) — `pyproject.toml` (pinned deps), `uv`
   venv at `Backend/.venv`, `app/main.py` (app factory, CORS for
   http://localhost:3000, `GET /health`), `app/core/config.py`
   (pydantic-settings, reads repo-root `.env`, crashes if `DATABASE_URL`
   missing), `app/core/db.py` (single async engine + session factory).
3. **Alembic** — `alembic.ini`, async `env.py` (URL from app settings),
   `alembic/versions/001_initial_schema.py` creating **all 11 §4.5 tables**:
   users, study_plans, study_tasks, decks, flashcards (fsrs JSONB,
   source_snippet ≤200 chars), review_events (append-only), records, roadmaps,
   kg_nodes (JSONB + unique user_id/label for FR-3.3 dedupe), kg_edges (JSONB),
   event_outbox (unique (user_id, seq) for §5.3). Verified on the real
   Postgres: `upgrade head` ✅ → `downgrade base` ✅ → `upgrade head` ✅,
   `\dt` shows all tables.
4. **Frozen contracts** — `Backend/app/schemas.py` (Pydantic, camelCase
   aliases matching the JSON contract) and `frontend/lib/types.ts` (TS mirror
   + §5.3 `WorldEvent` union), transcribed verbatim from REQUIREMENTS §5.1–5.3.
5. **Frontend deps** (pinned exact in `frontend/package.json`, installed):
   three 0.186.0, @react-three/fiber 9.7.0, @react-three/drei 10.7.8,
   @react-three/postprocessing 3.1.1, camera-controls 3.1.2, zustand 5.0.15.
   No other frontend file touched (except the new `lib/types.ts`).
6. **Lint/type** — `Backend/ruff.toml`, `Backend/mypy.ini` (strict);
   `Backend/README.md` (runbook: venv, alembic, uvicorn, tests, gates).

## Exit-test evidence

| Test | Result |
|---|---|
| `docker compose up -d db` | `enjoy-db Up … (healthy)`, 0.0.0.0:5433->5432 |
| `alembic upgrade head` / `downgrade base` | both pass on real Postgres (ran up→down→up) |
| `uvicorn app.main:app` → `GET /health` | `{"status":"ok","demoMode":true}` HTTP 200 |
| `npm run build` (frontend) | ✓ Compiled + type-checked, static prerender OK |
| `ruff check .` / `mypy` (Backend) | All checks passed / no issues in 8 files |

## Deviations & decisions (monitor attention)

1. **Port 5432 → 5433 (owner-approved).** A **native Windows PostgreSQL
   service** (`postgres.exe`, PID 8016) already listens on 0.0.0.0:5432, so
   connections hit it (wrong password) instead of Docker. User chose: keep
   native PG untouched, remap Docker. Changed `docker-compose.yml` to
   `"5433:5432"` and `DATABASE_URL` in `.env` + `.env.example` to
   `localhost:5433/harbour`. **Docs that still assume 5432 need a monitor
   pass** (e.g. BUILDING.md §1.5 mentions compose but no port; root README
   setup section is monitor-owned per BUILDING §3 Phase 0.5).
2. **Git repo at root is NOT initialized** (monitor's prompt said to report).
   `frontend/` has its own `.git`. Phase -1 requires root `git init` + first
   commit — left for the human/monitor (no git mutations without approval).
3. **Alembic file naming:** `alembic.ini` uses `file_template = %%(rev)s_%%(slug)s`
   and revision ids are the zero-padded numbers themselves (`revision = "001"`),
   satisfying AGENTS.md §5.3 naming.
4. **Two narrow `type: ignore`s**, each commented in place: pydantic-settings
   env injection (`config.py`) and untyped `JSONB.__init__` (migration 001).
5. **Windows console mojibake:** alembic log lines render `—`/`§` as garbage
   under cp950 console; files themselves are UTF-8 and correct. Cosmetic only.
6. **TS gotcha fixed:** contract type `Record` shadows TS's built-in
   `Record<K,V>`; `ErrorEnvelope.detail` uses `globalThis.Record<string, unknown>`.
7. npm warned: `unrs-resolver@1.12.2` postinstall script not run (allowScripts
   policy). Build passes regardless; flagging for visibility.

## NOT verified / out of scope (by design)

- No endpoints beyond `/health`; no seed script (Phase 1, Agent L fixture →
  `Backend/scripts/seed.py`); no pytest tests yet (harness is Phase 1 support
  task per BUILDING §3); `next dev` not run (exit test used `npm run build`).
- `alembic check` (autogenerate diff) not applicable — no ORM models exist yet
  (Agent L adds them; they must match migration 001).

## State at end of session

- Postgres running in Docker on **5433**, schema at head (001).
- Backend serves `/health`; ruff+mypy clean gates configured.
- Contracts frozen in both type files — changes via monitor only.
- Frontend has all 3D deps pinned; stock page untouched.
- **Checkpoint 0 ready for monitor review.** Agent S converts to Support.
