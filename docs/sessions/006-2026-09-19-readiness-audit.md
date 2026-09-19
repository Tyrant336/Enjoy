# Session 006 — 2026-09-19 — Pre-build readiness audit

## Goal
Verify the project is actually ready to build; close gaps found.

## Gaps found (audit of environment + docs)
1. **Docker not installed** on this machine → PostgreSQL-via-compose would fail.
   Added Phase -1 to BUILDING.md: install Docker Desktop OR native PostgreSQL 16.
2. **No git repo initialized** → plan requires branch-per-agent. Added to Phase -1
   (`git init` + baseline commit — to be done by owner/monitor).
3. **04-orchestrator distill contradicted REQUIREMENTS v2.1** (WebSocket vs locked
   SSE) → FIXED: distill now states SSE override + canonical §5.2 reference;
   `websockets` dep → `sse-starlette`.
4. **Distills referenced `Frontend/` (capital F)** vs actual `frontend/` → FIXED
   (all 6 distills normalized).
5. **Micro-ambiguities agents would have guessed at** → locked in BUILDING §1.5:
   FE→BE direct connection with CORS (no Next SSE proxying), uvicorn single worker,
   pyproject + pinned deps, ruff+mypy in Phase 0.

## Verdict
Ready to build AFTER Phase -1 (~30 min: Docker/Postgres + git init + .env key).
Python 3.12.7 ✅, Node 24.18.1 ✅.

## State at end of session
BUILDING.md v2.0 + §1.5 prerequisites; all distills consistent with REQUIREMENTS v2.1.
