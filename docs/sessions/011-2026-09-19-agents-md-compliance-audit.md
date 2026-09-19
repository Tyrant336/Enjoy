# Session 011 — 2026-09-19 — AGENTS.md compliance audit (all md files)

## Method
Grep audit of every markdown file against AGENTS.md rules (§2 fail-loudly,
§3 one-path, §5 Postgres-only, §6 coverage, §8 docs rules).

## Violations found & FIXED
1. **plan.md** — "seeded demo data as the instant fallback" (§2 silent-fallback
   wording) → reworded to deliberate `DEMO_MODE=true` set by a human.
2. **BUILDING.md risk table** — pre-authorized a 90%-coverage exemption
   (§6.1 says "no exceptions") → reworded: NO exemption granted; scope relief
   requires amending AGENTS.md §6 explicitly + session log.
3. **03-knowledge-graph/distill** — still listed `react-force-graph-3d` as a dep +
   react-force-graph contract note + `atlas.json` storage (contradicts §4.5
   PostgreSQL JSONB) → all three corrected.
4. **04-orchestrator/distill** — leftover "plain-WS protocol" wording → "plain SSE".
5. **05-frontend-world/distill** — deps list included `react-force-graph-3d`;
   `Frontend/` capital path → both fixed.
6. **opensource/README.md** — `Frontend/public/models/` → `frontend/...`.
7. **AGENTS.md §8.1** — doc-location rule conflicted with reality (frontend/AGENTS.md
   auto-generated, opensource distills, Background analysis) → added a declared
   exceptions clause (§8.2-compliant update).
8. **frontend/README.md** — was stock create-next-app content (stale docs = §2
   silent failure) → replaced with real run/structure/ownership doc.

## Verified clean
- SSE/PostgreSQL/KeyBERT-fallback wording consistent everywhere (§2, §3, §5).
- "Cell Division" only as label text / historical session notes (allowed per §4.6).
- Allowed fallbacks (KeyBERT, demo intervals) are all REQUIREMENTS-specified +
  config-selected — compliant with §2.1 exception.

## Note for monitor
Session files: next free number is **012**. (Agent S's Phase-0 session should NOT
use 008–011 — taken.)

## State at end of session
All markdown files comply with AGENTS.md as amended (§8.1 exceptions clause).
