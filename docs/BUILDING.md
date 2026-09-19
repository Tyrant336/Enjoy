# BUILDING — enjoy · Build Plan & Agent Orchestration

> Team: 1 **monitor (orchestrator agent)** + 3 **builder agents**.
> Division of labor: **scaffolding = one agent (soft tasks, fast)** ·
> **all three.js/3D = one dedicated agent (the big task)** ·
> **backend logic + non-3D wiring = one agent**.
> Read order for every builder: `AGENTS.md` → `docs/REQUIREMENTS.md` (v2.1) →
> this file → your `opensource/*/distill/DISTILL.md`.
> This file is a PLAN, not a requirement — where they conflict, REQUIREMENTS wins.

- Version: 2.1 · Date: 2026-09-19 (supersedes 2.0 — roles are now HATS, not names:
  agents are assigned per phase/workstream at each checkpoint; see §2.1)

---

## 1. Current State (scanned 2026-09-19)

| Area | State |
|---|---|
| `docs/REQUIREMENTS.md` | ✅ v2.1 — contracts locked (§4 architecture, §5 data/API/SSE) |
| `frontend/` | ⚠️ Stock create-next-app (Next 16, React 19, Tailwind 4). No three.js/R3F/zustand yet. `public/models/{fishboat,lamp-buoy,smallboat}.glb` ✅ |
| `Backend/` | ❌ Empty |
| `opensource/01–07` | ✅ Code cloned + distill specs written |
| `docker-compose.yml` | ❌ Missing (PostgreSQL) |
| `.env.example` | ✅ OpenRouter + DATABASE_URL (`harbour`) + port 8000 |

**Build strategy:** contracts are frozen (REQUIREMENTS §5). Agent S scaffolds
everything up front; then the two long poles run **in parallel against seeds/mocks**:
Agent T heads-down on the 3D world, Agent L on backend logic + wiring.
The monitor integrates at checkpoints. Nobody waits for another agent's code.

---

## 1.5 ⬜ PHASE -1 — Environment Prerequisites (BEFORE anything, ~30 min, human+monitor)

Audited 2026-09-19 — these are NOT in place yet:

| Item | Status | Action |
|---|---|---|
| Python 3.12.7 | ✅ installed | — |
| Node 24.18.1 | ✅ installed | — |
| **Docker** | ❌ **not installed** | Install **Docker Desktop for Windows** (WSL2 backend), then `docker compose up -d db` — `docker-compose.yml` (Postgres 16, db `harbour`) now exists at repo root. Alternative: install **PostgreSQL 16 natively**, create db `harbour`, skip compose |
| **Git repo** | ❌ **not initialized** | `git init` + first commit of current state (plan §5.6 needs branches) |
| `.env` | ✅ exists | `OPENROUTER_API_KEY` filled + verified live (required — NO demo mode, REQUIREMENTS §4.2, session 011) |

**Micro-decisions (locked here so agents don't guess):**
- **FE↔BE connection:** browser calls FastAPI directly at `http://localhost:8000`
  (env `NEXT_PUBLIC_API_URL`), CORS enabled for `http://localhost:3000`. Do NOT
  proxy SSE through Next rewrites (buffering breaks streams).
- **uvicorn:** single worker in v1 (`--workers 1`) — SSE connections live in-process.
- **Python packaging:** `Backend/pyproject.toml` + pinned deps, `uv venv` or `python -m venv`
  (S picks one, documents it).
- **Lint/type:** `ruff` + `mypy` configs created by S in Phase 0 (AGENTS.md §9 gate).

---

## 2. Team Topology

### 2.1 Agent assignment model — HATS, not names

S / T / L are **roles (hats), not fixed identities.** The monitor assigns an agent
to a hat at each checkpoint, and the agent wearing a hat may change between
phases (e.g. Phase 0 S-hat ≠ Phase 1 S-hat; Phase 1 T-hat ≠ Phase 2 T-hat).

**Handoff protocol (mandatory when a hat changes agents):**
1. Outgoing agent leaves: a session file (`docs/sessions/NNN-*.md`) with verified
   state, its branch pushed, exit-test evidence, and a "what I'd do next" note.
2. Incoming agent reads IN THIS ORDER: `AGENTS.md` → `docs/REQUIREMENTS.md` →
   this file → the hat's reading list (§2) → **the latest session file(s) for its
   hat** → the current code in its ownership zone.
3. The incoming agent's first act is re-running the previous phase's exit tests —
   trust nothing, verify everything (AGENTS.md §1.1).
4. A hat is never shared by two agents at once; the monitor hands it over
   explicitly at a checkpoint.

```
                ┌─────────────────────────────┐
                │  MONITOR (orchestrator)     │  contracts, merges, E2E,
                └──────────────┬──────────────┘  checkpoints, cut-line
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
 ┌─────────────┐      ┌──────────────────┐     ┌──────────────────┐
 │ AGENT S     │      │ AGENT T          │     │ AGENT L          │
 │ Scaffold →  │      │ 3D WORLD (big)   │     │ Logic + Wiring   │
 │ then Support│      │ all three.js     │     │ BE + non-3D FE   │
 └─────────────┘      └──────────────────┘     └──────────────────┘
   short-lived            critical path           critical path
```

| Agent | Mission | Owns (exclusive write) | Reads first |
|---|---|---|---|
| **Monitor** | Traffic + QA | `docs/`, `README.md`, merges, E2E, cut decisions | everything |
| **S — Scaffold** (then **Support**) | Phase 0: ALL scaffolding, both ends. After that: seed data, tests, devops, unblocker | `Backend/**` skeleton, `docker-compose.yml`, `frontend/package.json` (deps), `frontend/lib/types.ts` | `04-orchestrator/distill`, `.env.example` |
| **T — three.js World** | THE BIG TASK: every pixel of 3D — above-water world, underwater atlas layer, camera, review POV, animations | `frontend/components/world/**`, `frontend/components/underwater/**`, `frontend/lib/atlas/**`, `frontend/lib/theme.ts`, `frontend/lib/worldApi.ts`, `frontend/public/**` | the local visual-reference pack (gitignored), `05,06,07/distill`, `07/app/README.md` + `info.md`, `docs/LABELS.md` |
| **L — Logic** | Backend agents + API + DB + FE non-3D (chat UI, task sheet, tour UI, banners, SSE bus) | `Backend/**` (after S's skeleton), `frontend/lib/worldBus.ts`, `frontend/components/ui/**` | `01,02,03,04/distill`, REQUIREMENTS §4–§5 |

**Shared files (conflict zone — monitor serializes):** `frontend/app/page.tsx`,
`frontend/app/layout.tsx`, `frontend/app/globals.css`. Nobody edits these except
the monitor at integration time.

**Why this split works:** scaffolding is bursty setup work — one agent does it in
hours, then converts to Support. The 3D world is the single biggest, most cohesive
chunk — giving it to ONE agent avoids the worst conflict zone (two agents editing
one three.js scene) and keeps visual consistency in one head. L's work is
contract-driven, so it never needs T's code to proceed — only the `worldApi.ts`
*signature* (frozen at Checkpoint 1).

---

## 3. Phase Plan

### 🟦 PHASE 0 — Scaffolding (Agent S solo; T & L prep in parallel, ~3–4 h)

**Agent S (the only one writing code this phase):**
1. `docker-compose.yml` (Postgres 16, db `harbour`, matches `.env.example`) — verify `docker compose up db`.
2. `Backend/` skeleton per `04-orchestrator/distill`: FastAPI app factory, config
   (`DATABASE_URL`, OpenRouter required — NO demo mode, session 011), SQLAlchemy 2.x async +
   asyncpg, Alembic + migration `001_initial_schema` (all §4.5 entities), `/health`.
3. `frontend` deps: `three @react-three/fiber @react-three/drei @react-three/postprocessing camera-controls zustand` (pin versions).
4. Contract type files (from REQUIREMENTS §5, verbatim): `Backend/app/schemas.py`
   (Pydantic) + `frontend/lib/types.ts` (TS mirror).
5. Run scripts/docs: root `README.md` setup section (via monitor), `.env` from example.
**Exit test:** `alembic upgrade head`+`downgrade base` pass; uvicorn serves `/health`;
`next dev` renders the stock page with new deps installed.

**Agent T (prep, no production code):** study `07/app/src/lib/atlas.js` end-to-end +
the local visual-reference pack (gitignored); prototype the water shader + GLB loading in a scratch
route (`frontend/app/lab/page.tsx` — lab routes are T's sandbox, deleted before demo).
**Agent L (prep):** design doc (½ page each, posted to monitor): demo planner flow
(FR-1.5 P0), review session state machine (FR-2.5/2.9), event_outbox write path
(§5.3 transaction). Write the §4.6 seed fixture JSON (hand it to S for `seed.py`).

✅ **Checkpoint 0 (monitor):** S's exit tests pass; contracts frozen — changes only
via monitor; scaffold branch merged to main. **Agent S converts to Support role.**

### 🟩 PHASE 1 — Vertical Foundations (T ∥ L, S supports, ~1 day)

**Agent T (3D):** the harbour per REQUIREMENTS §2 + the local visual-reference pack (gitignored):
Ocean (stylized-water approach), fog/horizon/Sky, `fishboat.glb` + "Today" pill,
`lamp-buoy.glb` + "Journal" pill, small-boat fleet circling the lamp (slow, eased,
bobbing) + 1 docked boat, `CameraRig` presets (`overview/fishboat/fleet/lamp/
underwater/review`), label toggle (`L`), lamp glow levels.
Then `AtlasLayer.tsx` mounting `atlas.js` + `atlasAdapter.ts` (§4.3, no-red palette
FR-3.6) fed by a **local seed-graph fixture** (from S) + dive/surface transition.
**Exit test:** §2.4 visual checklist passes on screenshots; dive→atlas shows seed
graph; node click → detail drawer.

**Agent L (logic):** `seed.py` loads §4.6 fixtures (fixed IDs, real-now-relative dates).
Endpoints on seed data: `GET /api/world-state` (canonical §5.2), `GET /api/records`,
`GET /agents/kg/graph`, `GET /agents/flashcards/today`. Event outbox + SSE stub
(`GET /api/events` replays outbox in per-user `seq` order).
**Exit test:** curl returns seeded WorldState; SSE streams a seeded `narrate`.

**Agent S (support):** ✅ DONE (session 014) — wrote `worldApi.ts` *skeleton*
(method names from §5.3 events — T fills implementation in Phase 2, L consumes
it); set up pytest + the BE test harness (real Postgres `harbour_test`,
`client`/`db_session`/`seeded_user_id` fixtures); authored the §4.6 canonical
fixture + FE atlas export; fixed env annoyances (session 014 deviations).
**S then pre-starts its Phase 2 items (session 015): E2E skeleton + coverage tests.**

✅ **Checkpoint 1 (monitor):** T's world demo + L's API demo both run.
**`worldApi.ts` signature frozen.**

### 🟨 PHASE 2 — Core Loops (T ∥ L, S tests, ~1 day)

**Agent T:** Review POV (FR-2.5 exact flow): camera mounts on boat, question pill,
reveal, 4 grade boats (Again=amber), sink/rise (700–1200 ms), "Return to harbour"
+ `Esc`+`1–4`. Today task-sheet hook points (L renders the sheet UI; T provides
"open sheet" camera move + pill anchor). Dock-at-lamp + lamp-glow animations.
Implement `worldApi.ts` methods (flyTo, spawnBoat, enterReviewPOV, sink, rise,
dock, setLampGlow…). Reduced-motion variants for every animation.
**Exit test:** full review playable with mock cards, keyboard-only.

**Agent L:** P0 implementations behind frozen contracts (one path, no demo mode):
pre-router (FR-0), template planner → `StudyPlan` (FR-1.5 P0), review endpoints
`reveal/grade/exit` (P0 fixed intervals FR-2.8, session rule FR-2.9), `tasks/{id}/complete` → Record,
tour endpoints, outbox writes **in the same transaction** as mutations (§5.3),
error envelope. FE non-3D: `worldBus.ts` (SSE client, seq ordering, idempotent,
gap→refetch), chat UI + transcript, tour UI (offer/"?"/skip), task sheet (FR-1.6),
banners (error/offline), `X-Harbour-User-Id`/timezone bootstrap.
**Exit test:** curl journey: chat → tour_offer → start → events in seq; grade 3
cards → deck completes → record + lamp_glow.

**Agent S:** writes the E2E skeleton (demo script §8 as a test), BE unit tests for
planner/scheduling, coverage setup (AGENTS.md §6). *(E2E skeleton + coverage
tests started early in Phase 1, session 015; planner/scheduling unit tests
stay here — they need L's Phase 2 planner code to exist first.)*

✅ **Checkpoint 2 (monitor):** loops proven independently; ready to wire.

### 🟧 PHASE 3 — Integration & Demo Hardening (monitor-led, all hands, ~1 day)
1. Monitor wires `page.tsx`: chat + world canvas + atlas layer + banners.
2. Run REQUIREMENTS §8 demo script; file bugs; owners fix in their zones.
3. E2E passes incl. refresh-during-review recovery (world-state rebuild).
4. NFR-2 no-red automated checks + §2.4 side-by-side. Accessibility pass.
5. §8.1 P0 Definition of Done — every box ticked or explicitly cut by monitor.

✅ **Checkpoint 3: P0 COMPLETE = demoable product.**

### 🟥 PHASE 4 — P1 Stretch (only after Checkpoint 3, priority order)
1. Docling ingestion (L) 2. OpenRouter LLM mode (L) 3. py-fsrs (L)
4. `.apkg` export (L) 5. godrays/marine-snow polish (T) 6. LLM tour narration (L+T)
P2 (voice, AnkiConnect, Neo4j): only if the demo is bulletproof.

---

## 4. Timeline (**24-hour hackathon** — corrected from 72h, session 011; phases -1+0 already done)

| Time | Phase | Milestone |
|---|---|---|
| done | Phase -1 + 0 | S: scaffolds done, contracts frozen; opensource audited; NO demo mode |
| H0–H6 | Phase 1 | T: seeded world + atlas · L: seeded API + SSE · S: fixtures + harness |
| H6–H14 | Phase 2 | T: review POV + worldApi · L: full logic + wiring · S: E2E skeleton |
| H14–H19 | Phase 3 | Integrated, §8.1 DoD, rehearsed (monitor-led) |
| H19–H24 | Buffer / Phase 4 | P1 only if P0 bulletproof; else polish + rehearsal |

**Critical path = Agent T.** T must never be blocked: L delivers contracts/mocks,
S absorbs anything non-3D that lands on T's plate (styling chores, test writing,
asset tweaks, `README` updates).
**Sync:** 15-min at each checkpoint; status = "verified by execution" only
(AGENTS.md §1.2). Blocked >30 min → escalate to monitor immediately.

**Cut-line (monitor, in order):** 1) P1 extras (real ingestion refinements)
2) godrays/caustics 3) tour narration → scripted seed text 4) kg build endpoint.
**Never cut:** no-red palette, review loop, seeded E2E demo, accessibility basics.

---

## 5. Working Agreements

1. **Ownership zones (§2) are absolute.** Cross-zone changes via monitor only.
2. **Contracts frozen.** Change = monitor edits REQUIREMENTS + both type files in
   one commit, then notifies everyone.
3. **T↔L interface = `worldApi.ts`** (S drafts at P1, T implements, L consumes;
   frozen at Checkpoint 1).
4. **Agent S after Phase 0 = Support:** seeds, tests, devops, docs, unblocker —
   never starts new features while T or L is blocked on something S can take.
5. **AGENTS.md governs all code** — fail loudly, one path, typed boundaries,
   session file per builder at day end (`docs/sessions/`).
6. **Git:** `agent-s-scaffold`, `agent-t-world`, `agent-l-logic`; monitor merges
   to main at checkpoints only. Small diffs.
7. **Monitor never writes feature code** — contracts, E2E, reviews, cut decisions.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Agent T overloaded (3D is huge) | S absorbs non-3D chores; cut-line protects polish items; atlas.js engine is pre-built (07) — T integrates, doesn't invent |
| atlas.js vanilla-three ↔ React lifecycle | single instance, strict mount/unmount, Layer A pauses underwater (§4.3) |
| Next 16/React 19 + R3F compat | S validates at Phase 0 exit test; pinned versions |
| 90% coverage vs hackathon speed | AGENTS.md §6 applies as written (≥90%, real assertions, real-Postgres integration, E2E demo test) — this plan grants NO exemption. If scope relief is ever wanted, the monitor must amend AGENTS.md §6 explicitly + log it in a session file first. |
| Scaffolding drags (env issues) | Timebox Phase 0 to 4h; S escalates blockers fast; T/L prep is productive regardless |
