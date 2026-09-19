# Session 011 — NO DEMO MODE (owner directive) + opensource audit

- Date: 2026-09-19
- Role: Monitor
- Trigger: owner directive — *"NO DEMO MODE… one way one path. If something cannot
  work, either fix it, or change it."* Plus: prove the opensource set is
  safe/sufficient, and enforce AGENTS.md so no agent reintroduces a demo mode.

## 1. OpenRouter key — verified LIVE (execution evidence)

`GET https://openrouter.ai/api/v1/auth/key` with the root `.env` key returned:
`is_free_tier: false`, `limit: null`, `usage: 0.00000728`,
`expires_at: 2026-09-26…`. **The key is real, paid-tier, and valid through the
hackathon.** A demo mode was never necessary — removed entirely.

## 2. DEMO MODE CRUSHED (one path, everywhere)

- **REQUIREMENTS.md** — §4.2 "Demo mode" bullet replaced with **"NO DEMO MODE
  (LOCKED — owner decision 2026-09-19, session 011)"**: one runtime path,
  `OPENROUTER_API_KEY` required (missing/invalid → loud startup crash), runtime
  LLM failure → §5.2 error envelope + SSE `error`, never substituted content;
  "fix it or owner changes the requirement — never a parallel mode". Also
  scrubbed: FR-1.5 (P0 template planner is THE planner, not a mode), FR-2.8
  (P0 fixed intervals are THE P0 scheduler, not config-selected), §4.6 +
  §8.1 (seeds dated against real now, no `DEMO_NOW`), §5.2 WorldState
  (`demoMode` field removed), §7.2 (no practice-materials banner), §8 #8
  (network-kill test = loud failure, not demo completion).
- **AGENTS.md** — new §3.4 **"NO REALITY MODES (ZERO TOLERANCE)"**: no
  DEMO_MODE/practice/mock modes, no env flag swapping real behavior for canned
  content; seed fixtures loaded deliberately are test data, not a mode.
  §3 renumbered (dead switches → 5, kill-don't-accumulate → 6).
- **BUILDING.md** — Phase -1 table, Phase 0/2 Agent L tasks, cut-line updated.
- **Code** — `config.py`: `demo_mode`/`demo_now` deleted, `openrouter_api_key`
  now **required** (startup crash without it). `main.py`: `/health` →
  `{"status":"ok"}`. `schemas.py` + `frontend/lib/types.ts`: `demoMode` removed
  from `WorldUser` (contract change — monitor-authorized by owner directive).
- **Backend/README.md** — updated required-env + `/health` output.

### Re-verified after the change (execution evidence)
- `ruff check .` ✅ · `mypy` ✅ (8 files)
- Missing-key test: `Settings(_env_file=None)` without env →
  `ValidationError: Field required` — **loud crash confirmed** ✅
- `uvicorn` → `GET /health` → `{"status":"ok"}` HTTP 200 ✅
- `npm run build` ✅ (types.ts change compiles)

## 3. opensource/ audit (thorough, read-only sub-agent, verified on disk)

**Who distilled:** earlier Kimi agent sessions (provenance: `download.sh`
shallow-clones 25 named GitHub repos; 06 assets custom-built via Blender script;
07 unpacked from `Kimi_Agent_Anki Abyss_ Underwater Atlas.zip`).

**Verdict: SAFE AND SUFFICIENT.** All 7 folders exist; every locked pick from
REQUIREMENTS §6 verified present (GLBs **md5-identical** between
`06-assets-cc0/` and `frontend/public/models/`; `atlas.js` 903 lines with
`createAtlas`/`loadPdfGraph` API; all BE reference repos present). Licenses:
19 MIT, 2 Apache-2.0, 1 zlib, CC0 assets. ~200 MB total, no CUDA-only blockers,
no telemetry/phone-home, Windows-local OK.

**Caveats recorded into REQUIREMENTS §10 (monitor decision log):**
1. `07-underwater-atlas` has **no license file** → owner decision: copy with
   source-attribution comments (hackathon-accepted risk). Its `decks.js` canned
   palette **contains red** (`#e0492e`, `#d63384`) → Agent T must re-tint to the
   approved no-red palette when porting. Shipped atlas.js was re-themed
   (NormalBlending bright lagoon) — trust code over its stale README; T
   re-applies the locked dark/additive look.
2. `02/md2anki` (GPL-3.0) and `01/clive` (no license) → reference-only
   (opensource/README already treats them so).
3. `babyagi` README claims MIT but LICENSE file missing — reference-only by
   default; none of its code is a locked pick.

## 4. Ports (current reality)

| Service | Port | Notes |
|---|---|---|
| Frontend (next dev) | **3000** | CORS-allowed origin on the BE |
| Backend (uvicorn) | **8000** | 127.0.0.1, single worker (SSE in-process) |
| Docker Postgres (`enjoy-db`) | **5433** → container 5432 | host 5432 taken by native Windows PostgreSQL service (session 010, owner-approved) |

## State at end of session

- One runtime path. No demo machinery anywhere in code or docs.
- Contracts re-frozen without `demoMode` (both type files updated together).
- opensource vetted with on-disk evidence; caveats are law in §10.
- All gates green. Ready for Agent T / Agent L sessions.

## 5. Addendum — local-only files (owner decision)

Owner: several local-only folders plus `docs/REQUIREMENTS.md` are never
committed (see `.gitignore`). Nothing in code depends on them at runtime.
Committed docs refer to them only generically ("local visual-reference pack").
