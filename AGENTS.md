# AGENTS.md — Hard Rules for All AI Agents Working on This Repo

> **Read `docs/REQUIREMENTS.md` first.** It is the single source of truth for the product
> ("Harbour of Learning" — Townscaper-style ocean world that automates studying).
> This file is the single source of truth for **how code is written**.
> If this file conflicts with your instincts, this file wins.
> If this file conflicts with `docs/REQUIREMENTS.md`, stop and ask — do not guess.

- Stack: **Backend** = Python + FastAPI + LangGraph. **Frontend** = Next.js + react-three-fiber (see `frontend/AGENTS.md` for Next.js-specific rules).
- Database: **PostgreSQL only**, schema managed by **Alembic** (see §5).

---

## 1. Anti-Hallucination / Anti-Rogue Rules (ZERO TOLERANCE)

These rules exist because AI coding agents have well-documented failure modes:
gap-filling with guesses, fabricating artifacts, declaring partial progress "done",
and failing silently. Every rule below targets a real, observed failure pattern.

1. **Never guess, verify.** If you don't know a file's content, an API's signature, a
   schema's columns, or a library's behavior — **read it first** (file, docs, or
   `node_modules/next/dist/docs/` for Next.js). Do not fill gaps with training-data
   assumptions. Unknown → check. Still unknown → **stop and ask**, never invent.
2. **Never fabricate state.** Do not claim a file was created, a test passed, a
   migration ran, or a server started unless you ran the command and saw the real
   output. Never invent terminal output, IDs, URLs, or "expected" results.
3. **Progress ≠ completion.** Do not declare a task done because code exists. A task
   is done only when: it compiles/builds, its tests pass, and the end-to-end user
   path it serves actually works. Report exactly what was verified and how.
4. **No one-shotting.** Do not attempt to build a whole feature in one giant step.
   Work in small, verifiable increments: change a little, run it, verify it, then
   continue. Never leave a half-built mess and move on.
5. **No self-review softness.** Do not grade your own work with praise. If something
   is untested, awkward, or unverified, say so plainly in your final report.
6. **Stay on the rails.** Do exactly what was asked — no drive-by refactors, no
   "while I was here" improvements, no renaming, no reformatting of untouched code.
   Minimal diff, always.
7. **One agent, one concept.** Before adding a new abstraction, grep the codebase:
   if the concept already exists, reuse it. Two implementations of the same thing
   ("split-brain") is a critical defect here.
8. **When reality contradicts your assumption** (a command fails, a file isn't where
   you thought, a test you didn't touch breaks): **STOP. Do not patch around it.**
   Investigate the root cause and report it loudly. Assumption mismatches that get
   papered over become the worst class of production bugs.

---

## 2. FAIL LOUDLY — No Silent Anything

**The worst bug in this project is a silent one.** If something is not as expected,
it must be impossible to ignore.

1. **No silent fallbacks.** If a primary path fails, do **not** quietly degrade to a
   default value, a cached copy, a regex parse, or a "best effort" result. Raise an
   explicit error with context. (Exception: a fallback explicitly specified in
   `docs/REQUIREMENTS.md`, e.g. FR-3.2's KeyBERT/YAKE path — and even then it must log at
   WARNING level and surface in the API response.)
2. **No swallowed exceptions.** No bare `except:`, no `try/except` that logs and
   continues, no `.catch(() => {})`, no `|| defaultValue` hiding a broken upstream.
   Catch only the specific exception you can genuinely handle; everything else
   propagates.
3. **No mock data in production code paths.** No hardcoded "demo" responses inside
   services, agents, or API handlers. Seed/demo data (NFR-4) lives in **one** place:
   a clearly-named seed script/fixture, loaded deliberately, never triggered by a
   failure. Tests may use fixtures — production code never "falls back" to them.
4. **Validation at the boundary.** Parse LLM output and external input into typed
   schemas (Pydantic / Zod). Parse by **key, never by position**. Schema mismatch =
   hard error with the offending payload logged, never a partial/garbled result.
5. **Errors must reach the user as errors.** The API returns explicit error states;
   the frontend renders them (soft amber/teal per §2 of REQUIREMENTS — still
   unmistakably an error). Never render an empty world and pretend all is well.
6. **Loud logging.** Every agent action, tool call, and fallback-that-is-allowed logs
   structured lines (who, what, why). A failure that only appears in a log line that
   scrolls past is still a silent failure — log AND raise.

---

## 3. ONE WAY, ONE PATH

1. **Exactly one way to do each thing.** One config loader, one DB session factory,
   one LLM client wrapper, one ingestion pipeline (shared by Flashcard FR-2 and
   Knowledge Graph FR-3, as required). No parallel "v2" implementations, no
   copy-pasted variants with small tweaks.
2. **No sideways branches.** No `if god_mode:`, no hidden admin bypasses, no "quick
   hack" code paths reachable only in some environments. Dev, test, and demo run the
   **same code**; only configuration differs.
3. **No dual-track logic.** Do not implement a feature two ways "just in case"
   (e.g. both WebSocket and SSE for orchestrator commands — pick **one**, per
   REQUIREMENTS FR-5.4). If a decision is genuinely ambiguous, ask before coding —
   do not build both.
4. **NO REALITY MODES (ZERO TOLERANCE — owner decision 2026-09-19, session 011).**
   No `DEMO_MODE`, no "practice mode", no mock mode, no env flag or config that
   swaps real behavior for canned/fake content. There is exactly **one runtime
   path**. If an external dependency fails → the §2 loud error path, never
   substituted fake data. If a capability genuinely cannot work → **fix it, or
   the owner changes the requirement** — shipping a parallel mode is forbidden.
   (Seed/test fixtures loaded deliberately by a named script are NOT a mode;
   they are test data per §2.3.)
5. **No dead switches.** No feature flags for unfinished work, no unused parameters,
   no commented-out code, no `TODO: implement later` stubs that are wired into live
   paths. Either it works now, or it doesn't exist in the codebase.
6. **Kill, don't accumulate.** When replacing an approach, delete the old one in the
   same change. Old + new coexisting = two ways = forbidden.

---

## 4. NO SPAGHETTI — Code Structure

1. **Small, single-purpose modules.** Each agent (Orchestrator, Scheduler, Flashcard,
   Knowledge Graph) is its own module with a typed interface. No file grows into a
   junk drawer — if a file passes ~300 lines, split it by responsibility.
2. **Typed contracts everywhere.** Pydantic models (BE) / TypeScript types (FE) for
   every structure crossing a boundary: agent outputs, WS commands, DB rows, API
   payloads. No `Dict[str, Any]` soup, no `any`.
3. **Dependencies point one way.** Shared ingestion/utils ← agents ← orchestrator ←
   API layer. Never import upward or sideways between agents; agents talk to each
   other **only** through the Orchestrator (per architecture §4).
4. **No deep nesting, no cleverness.** Early returns over nested `if` pyramids. Boring,
   obvious code beats smart code. If you need a comment to explain the trick, rewrite
   it plainly.
5. **Follow existing style.** Match the formatting, naming, and patterns already in
   the file you're editing. No personal flair.

---

## 5. Database — PostgreSQL + Alembic (STRICT)

> This **overrides** the "JSON files / SQLite" note in `docs/REQUIREMENTS.md` §4.
> Any persistent state (records/journal FR-4, decks, schedules, knowledge graph
> FR-3.3) lives in **PostgreSQL**. The knowledge graph is stored as JSONB tables in
> Postgres, not loose JSON files.

1. **PostgreSQL is the only database.** No SQLite, no in-memory stores, no JSON-file
   persistence in application code. Connection via SQLAlchemy 2.x (async) + asyncpg.
2. **Alembic owns the schema.** All tables/columns/indexes are created **only** by
   Alembic migrations. Never `CREATE TABLE` in app code, never hand-edit the database,
   never rely on `metadata.create_all()` outside of tests.
3. **Sequential, numbered revisions.** Revision files are named with a strict
   zero-padded sequence:
   ```
   alembic/versions/001_initial_schema.py
   alembic/versions/002_add_decks_table.py
   alembic/versions/003_add_graph_nodes.py
   ```
   The next number is always `max(existing) + 1` — check the directory before
   creating one. `down_revision` chains linearly; **no merge heads**.
4. **Every migration is reversible and tested.** Each migration implements a real
   `downgrade()`. CI/tests run `alembic upgrade head` **and** `alembic downgrade base`
   on a scratch database. A non-reversible migration is a failed migration.
5. **Migrations are append-only.** Never edit a migration that has been committed.
   Schema change = new migration.
6. **Models match migrations.** SQLAlchemy models and Alembic migrations must agree;
   CI runs `alembic check` (autogenerate diff) — a non-empty diff fails the build.
7. **Config via environment.** `DATABASE_URL` from env, no credentials in code, no
   hardcoded hosts. Missing `DATABASE_URL` = crash at startup with a clear message
   (fail loudly, §2).

---

## 6. Testing — ≥ 90% Coverage, Real Assertions

1. **Coverage gate: ≥ 90%** line coverage, enforced in CI (`pytest --cov --cov-fail-under=90`
   for backend; equivalent gate for frontend logic). A PR that drops coverage below
   90% fails — no exceptions, no "we'll backfill later".
2. **Coverage is a floor, not a goal.** Tests must assert **behavior**, not just
   execute lines. A test with no meaningful assertion is worse than no test — it
   fakes safety.
3. **Test pyramid:**
   - **Unit tests** for every agent's pure logic (task breakdown parsing, FSRS
     scheduling decisions, graph extraction post-processing, migration helpers).
   - **Integration tests** against a **real Postgres** (testcontainers or a scratch
     DB) — never against SQLite "because it's close enough". Dialect differences are
     exactly where silent failures breed.
   - **End-to-end test of the demo script** (`docs/REQUIREMENTS.md` §7 acceptance criteria) —
     the golden path must be executable as a test.
4. **Failure-path tests are mandatory.** For every feature, test what happens when
   the LLM returns garbage, the DB is unreachable, the file upload is corrupt.
   These tests prove §2 (fail loudly) actually holds.
5. **No mock theatre.** Mock only true externalities (OpenRouter HTTP calls). Never
   mock the database, your own services, or the component under test. If the test
   would pass with the feature deleted, it's mock theatre — delete it.
6. **Every bug fix ships with a regression test** that fails before the fix and
   passes after.

---

## 7. NEVER DO — Product Anti-Patterns (ZERO TOLERANCE)

> Backed by research (`docs/RESEARCH.md` Part 1 & 4). These break the two product
> promises — emotional comfort and time saving. Any code, copy, or design that
> introduces one of these is a defect, no matter how small.

1. **No pressure mechanics.** No streaks, no streak-loss warnings, no leaderboards,
   no XP/levels, no "you missed N days", no countdown guilt. The lamp records
   victories only — a returning student is welcomed, never billed for absence.
   (Finch/goblin.tools pattern: motivate through warmth, never threat.)
2. **No dashboards in the world.** No charts, no percentage bars, no analytics
   panels inside the ocean world. Progress is **spatial**: the circling fleet is
   the to-do ring, the lamp is the trophy shelf, the growing atlas is the
   portfolio. Numbers-as-decoration kill the calm.
3. **Never automate the thinking itself.** AI absorbs *extraneous* work only:
   planning, card formatting, scheduling, graph extraction, routing. It must NOT
   auto-answer reviews, replace retrieval practice with summaries, or "study for"
   the student (cognitive load theory, `docs/RESEARCH.md` Part 2). Saving time by
   destroying learning is a failure, not a feature.

---

## 8. Documentation Rules (MANDATORY, every session)

1. **All markdown docs live in `docs/`.** Only `AGENTS.md` and `README.md` stay at
   the repo root. New documentation → `docs/`. Product requirements →
   `docs/REQUIREMENTS.md`. Never scatter `.md` files elsewhere.
   **Declared exceptions (docs that live next to the code they describe):**
   `frontend/AGENTS.md` + `frontend/CLAUDE.md` (auto-generated by Next.js — do not
   edit/remove), `frontend/README.md`, `Backend/README.md`,
   the local visual-reference pack (gitignored — ask the owner/monitor),
   `opensource/README.md` + `opensource/*/distill/DISTILL.md` (integration specs
   for the vendored code) + READMEs inside vendored opensource projects.
2. **Every change updates the docs.** Whenever you create, modify, or remove
   anything (code, config, structure, rules), you MUST update `AGENTS.md` and
   `README.md` in the same session so they never drift from reality. Stale docs
   are a silent failure (§2).
3. **Every session writes a session file.** Before finishing, create
   `docs/sessions/NNN-YYYY-MM-DD-short-title.md` (NNN = next sequence number)
   recording: goal, what was done, decisions/overrides made, and the state at end
   of session. This is the project's memory — a fresh agent must be able to read
   the latest session file and know exactly where things stand.
4. **Cross-reference.** When a session file records a decision that changes rules
   or structure, link it from the relevant section of `AGENTS.md`.

## 9. Definition of Done (checklist before saying "finished")

- [ ] Code follows §1–§5: verified not guessed, loud failures, one path, no dead code.
- [ ] `alembic upgrade head` + `downgrade base` + `alembic check` all clean (if schema touched).
- [ ] Tests written, **all** tests run and pass, coverage ≥ 90%.
- [ ] Lint/typecheck clean (`ruff` + `mypy` for BE; `tsc` + `eslint` for FE).
- [ ] No red introduced anywhere (docs/REQUIREMENTS §2.1 / NFR-2).
- [ ] `AGENTS.md` + `README.md` updated; session file written (§8).
- [ ] Final report states what was verified by execution vs. what is assumed.
