# Session 001 — Project Setup & Governance

- **Date:** 2026-09-19
- **Agent:** Kimi Code CLI
- **Goal:** Establish project governance files and environment config before any product code is written.

## What was done

1. **`AGENTS.md` created** (root) — hard rules for all AI agents:
   - §1 Anti-hallucination/anti-rogue rules (grounded in researched failure patterns:
     gap-filling, fabricated artifacts, progress-as-completion, one-shotting, split-brain)
   - §2 Fail-loudly rules — no silent fallbacks, no swallowed exceptions, no mock data
     in production paths, key-based (never positional) LLM output parsing
   - §3 One-way-one-path rules — single implementation per concept, no god modes,
     no dual-track logic, no dead switches
   - §4 No-spaghetti structure rules — typed contracts, one-directional dependencies
   - §5 Database rules — **PostgreSQL only + Alembic**, sequential numbered revisions
     (`001_*.py`, `002_*.py`), reversible/tested migrations. Explicitly overrides the
     "SQLite/JSON files" note in `docs/REQUIREMENTS.md` §4.
   - §6 Testing rules — ≥90% coverage gate, real Postgres integration tests,
     failure-path tests mandatory, no mock theatre
   - §7 Definition of Done checklist

2. **`.env`, `.env.example`, `.gitignore` created** (root) — OpenRouter + Postgres config;
   secrets blocked from git.

3. **Model selected:** `deepseek/deepseek-v4.1-flash` via OpenRouter.
   - Requirement: cheap + vision-capable (agents read PDF/PPTX pages as images)
   - Gemini ruled out (banned in HK); DeepSeek V3/V4 Pro ruled out (text-only —
     verified against OpenRouter's live model list)
   - Note: model reasons by default — set `reasoning_effort: low` for simple calls.

4. **OpenRouter key verified live** — auth endpoint HTTP 200 + successful test
   completion via DeepInfra. Key expires **2026-09-26**.

5. **`docs/` structure created** — all markdown docs moved under `docs/`:
   `REQUIREMENTS.md` → `docs/REQUIREMENTS.md`, `plan.md` → `docs/plan.md`;
   `docs/sessions/` created for session logs (this file is the first).
   Root `README.md` created. Only `AGENTS.md` + `README.md` remain at root.

6. **AGENTS.md §8 added (Documentation Rules)** — docs live in `docs/`; every
   change must update `AGENTS.md` + `README.md`; every session writes a
   `docs/sessions/NNN-*.md` file recording what was done.

## Decisions & overrides

- Postgres + Alembic supersedes the SQLite/JSON storage note in REQUIREMENTS §4.
- `opensource/*.md` files stay in `opensource/` (already organized + internally indexed);
  the docs-folder rule applies to root-level and future documentation.

## State at end of session

- No product code exists yet. Next: backend scaffold (FastAPI + Alembic + config
  loader with fail-loudly startup) or frontend world shell — see
  `docs/REQUIREMENTS.md` §7 acceptance criteria for the target demo.
