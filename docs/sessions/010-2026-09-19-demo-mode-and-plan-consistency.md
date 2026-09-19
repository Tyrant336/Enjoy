# Session 010 — 2026-09-19 — DEMO_MODE semantics fixed + plan.md de-staled

## Goal
Owner flagged: "demo mode if key fail" contradicts AGENTS.md §2, and plan.md
disagreed with BUILDING.md.

## Origin (honest answer)
The "auto demo mode when key absent" wording came from the FIRST external PRD
review (v2.0 feedback: "Demo mode: enabled automatically when no OpenRouter key is
present"), incorporated into REQUIREMENTS §4.2 as "auto-suggested". This was a
mistake against AGENTS.md §2 (no silent fallbacks; seed never failure-triggered).

## Fixes
1. **REQUIREMENTS.md §4.2 + §7.2:** DEMO_MODE is explicit human-set config ONLY
   (default false). Missing/invalid key with DEMO_MODE=false → backend crashes at
   startup with a clear message (fail loudly). Demo mode is never auto-enabled.
2. **BUILDING.md §1.5:** `.env` checklist row aligned (deliberate DEMO_MODE=true,
   never auto).
3. **plan.md de-staled:** title → *enjoy*; build order deferred to BUILDING.md;
   team roles §5 replaced with hats model (T/L/S) pointing to BUILDING §2;
   KG rendering = locked 07 three.js engine (not "3D force graph");
   seed = deterministic Thermo fixture §4.6 (not "Cell Division"); acceptance ref
   §7 → §8; underwater row adds 07-underwater-atlas; LLM-slowness risk row aligned
   with deliberate DEMO_MODE.

## State at end of session
plan.md / BUILDING.md / REQUIREMENTS.md / AGENTS.md are mutually consistent.
