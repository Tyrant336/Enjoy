# Session 007 — 2026-09-19 — docker-compose.yml created

## What was done
- Created `docker-compose.yml` at repo root: PostgreSQL 16-alpine, db `harbour`,
  postgres/postgres (matches `.env.example`), port 5432, named volume
  `enjoy-pgdata`, healthcheck via `pg_isready`.
- Decision (documented): only Postgres runs in Docker; backend/frontend run
  natively for hot-reload. Updated BUILDING.md §1.5 accordingly.

## State at end of session
Phase -1 remaining for owner: install Docker Desktop (WSL2), `git init`,
fill `.env` key (or DEMO_MODE). Then `docker compose up -d db`.
