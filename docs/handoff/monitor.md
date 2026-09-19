# HANDOFF — MONITOR (read after AGENTS.md; this is your briefing)

> Written by the outgoing monitor, 2026-09-19 ~15:50, context exhausted.
> Project: **enjoy** — Townscaper-style 3D ocean world that automates studying.
> **24h hackathon — submission 10:00 TOMORROW (2026-09-20).** Owner sleeps 22:00,
> then agents run AFK under a standing order (see §6).

## 1. Your role (monitor — never write feature code)

Traffic + QA + memory. You OWN: `docs/`, `README.md`, merges/commits at
checkpoints, E2E, cut decisions, the shared files `frontend/app/{page.tsx,
layout.tsx, globals.css}` (Phase 3 wiring — only you touch these). You verify
every agent claim BY EXECUTION before believing it (AGENTS.md §1.2). Three
builder agents report to you: **T** (all 3D/three.js), **L** (backend logic +
non-3D FE), **S** (support: fixtures/tests/devops). Team topology + phases:
`docs/BUILDING.md`. Product law: `docs/REQUIREMENTS.md` (LOCAL-ONLY, gitignored).
Code law: `AGENTS.md`.

## 2. Verified state (by your own execution — trust this list)

- **Phase -1/0 ✅**: Docker `enjoy-db` healthy, Postgres 16. Backend skeleton,
  Alembic `001` (11 tables, upgrade+downgrade proven). Contracts FROZEN:
  `Backend/app/schemas.py` ↔ `frontend/lib/types.ts` (changes ONLY via you,
  both files together). Frontend 3D deps pinned.
- **Phase 1 ✅ (Checkpoint 1 passed)**: T's harbour + underwater atlas —
  YOU visually approved `.labshots/01` + `06`. L's seeded API — 5 endpoints +
  SSE, verified. S's fixtures/harness — verified.
- **Suite at handoff**: 89 passed / 6 skipped (E2E gates armed for Phase 2
  endpoints) · **coverage gate RED: 81.6% < 90%** (L's new modules outpaced
  tests — L+S assigned to fix) · ruff+mypy clean.
- **L landed mid-flight**: `app/agents/`, `api/chat.py`, `services/outbox.py`,
  `services/review_session.py`, router+planner tests. `/api/chat` wiring
  status unknown — verify.
- **T landed**: visual correction may be in-flight (see §3). S finished
  NFR-2 no-red checks (`Backend/scripts/no_red_check.py` + `tests/test_no_red.py`,
  negative case proven), coverage gate in pyproject, `docs/PHASE3-E2E-CHECKLIST.md`.
- **OpenRouter key: VALID** (verified live `/auth/key`, paid, expires 2026-09-26).
- **Git**: root repo, remote `github.com/Tyrant336/Enjoy.git`, one commit
  `9a828db` force-pushed CLEAN (Background/, Idea/, docs/REQUIREMENTS.md purged
  from history — owner privacy demand). Nested `frontend/.git` deleted.
  `.labshots/` gitignored. **Agents' work since that commit is UNCOMMITTED.**

## 3. In-flight directives (agents are executing NOW)

1. **T — PRIORITY 1 visual correction** (owner rejected the horizon): kill the
   "endline" (water plane edge = hard band), strengthen reflections, implement
   §2.6 camera (free-look orbit + top-down/fishboat-centric/lamp-centric,
   elevated 3/4 default like the reference video). T was told to WATCH
   `Background/Steam 2026-09-19 10-50-46.mp4`. THEN resume Phase 2 review POV
   (its full prompt is in this chat's history; re-issue from BUILDING §3 if lost).
2. **L — Phase 2 logic**: pre-router, template planner, /api/chat, review
   endpoints (reveal/grade/exit, FR-2.8 fixed intervals, FR-2.9 session rule),
   tours, same-transaction outbox (§5.3), error envelope; then FE non-3D
   (worldBus.ts, components/ui/**). MUST close coverage to ≥90% before "done".
3. **S — refilled queue**: flip E2E gates as L's endpoints land, planner unit
   tests, coverage rescue on pure logic (router/review-session/outbox), report
   what `Backend/.scratch/` is (gitignore it at next commit).
4. **HANDOFF IN PROGRESS**: all three agents were told to write
   `docs/handoff/agent-{T,L,S}.md` and reply HANDOFF-READY. When you start:
   check those files exist, REVIEW them for gaps, COMMIT everything
   (checkpoint commit — the tree has hours of uncommitted work), then the
   owner starts fresh builder sessions. If handoff files are missing/incomplete,
   reconstruct from `docs/sessions/012–017` + git status + this file.

## 4. Monitor rulings log (precedents — uphold these)

- **NO DEMO MODE / NO REALITY MODES** (owner, zero tolerance): one runtime
  path; OpenRouter required, loud crash without it; AGENTS.md §3.4 + REQ §4.2.
- **Ports**: FE 3000 · BE 8000 (single worker) · **DB 5433** (native Windows PG
  squats 5432 — owner-approved remap; compose/.env/.env.example updated).
- Fixture additions `user` + `seedNarration` APPROVED (loader + SSE test need).
- `CameraPreset` contract gap: T's local `WorldCameraPreset` superset accepted;
  decide formal contract patch at Phase 3 (types.ts stays frozen meanwhile).
- smallboat.glb repair accepted (stripped broken external texture ref).
- Coverage 90% gate enforced via `--cov-fail-under=90` in pyproject (no CI).
- Session numbering has COLLISIONS (agents wrote 010/011 duplicates of yours):
  normalize at integration.
- Zone ruling: `scripts/seed.py` = L; `scripts/fixtures/` + export = S.
- Voice = P2 stretch (STT/TTS adapt into the SAME /api/chat path, never a 2nd path).
- Reproducibility answer given to owner: deterministic skeleton + LLM content
  persisted once; offered temperature/seed pinning for P1 if owner wants.

## 5. Your next actions (in order)

1. Commit checkpoint (review handoff files first; add `.scratch/` to
   .gitignore). Push optional — owner consents per-push, ASK each time.
2. Verify `/api/chat` wiring + suite state; re-green the coverage gate via L+S.
3. Approve T's visual correction on `.labshots` evidence (3 perspectives, no
   endline, reflections) — compare against the reference video YOURSELF.
4. Checkpoint 2 when: review loop curl-journey passes + T's review POV plays.
5. **Phase 3 (yours)**: wire `page.tsx` (world canvas + chat + atlas layer +
   banners), run `docs/PHASE3-E2E-CHECKLIST.md` + §8 demo script, NFR-2 suite,
   keyboard-only 3-card review, §8.1 DoD tick or explicit cuts.
6. Cut-line if slipping: tour-narration flair → atlas polish → P1 everything.
   NEVER cut: no-red, review loop, seeded E2E, accessibility basics.

## 6. Owner context (communicate accordingly)

- Non-native English, direct, hates token waste and vague answers. Wants
  evidence, tables, short prompts to paste. AFK from 22:00 — builders have a
  standing autonomy order (docs rule: decide per docs, log deviations, never
  invent modes/data; unfinished > unverified).
- Privacy: NEVER commit Background/, Idea/, docs/REQUIREMENTS.md, .env;
  no source-image references in committed files (scrubbed once — re-check new
  code comments at every commit; T was warned).
- Backend restarts: background Shell tasks time out (60s default; use long
  timeout). Windows cp950 console: keep alembic.ini/ASCII; Python files UTF-8.

## 7. Session continuity

Project memory = `docs/sessions/` (001–017 + collisions) + `docs/handoff/`.
Write your own session file at every checkpoint or context handoff,
next free number — CHECK the dir first (collisions exist; pick unused).
