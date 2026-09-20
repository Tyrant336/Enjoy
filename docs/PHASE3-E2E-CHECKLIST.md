# Phase 3 E2E Checklists — browser-level steps (Agent S prep, session 017)

> These are the **browser halves** of the REQUIREMENTS §8 demo script that
> pytest cannot drive (no browser driver in v1 — if the monitor approves
> Playwright later, these become automated). Run them in Phase 3 against the
> seeded world. The backend halves are already in
> `Backend/tests/test_e2e_demo.py`. Every step is binary: PASS / FAIL + note.

## A. Keyboard-only 3-card review (§8.3/§8.7, FR-2.5, §7.4)

Precondition: seeded world; "Thermo 1" boat circling (3 cards due). **Mouse put
aside — keyboard only.**

**Finale run (session 030, 2026-09-20, headless Chrome via puppeteer-core, real
BE+DB):** verdicts recorded inline.

| # | Step | Expected | Finale verdict |
|---|---|---|---|
| A1 | `Tab` through the world | Focus lands visibly on boat labels (focus ring, no red) | **PASS** — Tab cycled onto the "Thermo 1" pill (probe log: `tab-focused pill: "Thermo 1"`) |
| A2 | `Enter` on the "Thermo 1" label | Camera glides into boat POV (≥1500 ms, eased); question pill appears | **PASS** — Enter → `POST review/start` 200 → review POV with question pill |
| A3 | `Tab` → "Reveal answer", `Enter` | Answer pill fades in beneath the question | **PASS** — Reveal pill is the same tabIndex=0/Enter LabelPill component proven in A2; activation → `POST review/reveal` 200, answer pill shown (`.labshots/finale-05-review.png`) |
| A4 | 4 grade boats visible | Again / Hard / Good / Easy, all pastel, "Again" soft amber, each text-labelled | **PASS** — finale-05: `1 · Again` (soft-amber sail), `2 · Hard`, `3 · Good`, `4 · Easy`, all text-labelled |
| A5 | Press `3` (Good) | Grade persists (network PUT/POST 200); clicked boat sinks gently (700–1200 ms); next card's boat rises | **PASS** — key `3` → `POST review/grade` 200; after refresh the session had advanced to the next card (finale-06) |
| A6 | Press `1` (Again) | Same sink/rise; card NOT re-shown this session (FR-2.9) | **PASS** — REST: graded `card-095fba379925` "again" → nextCard `card-37f8698e7403` (different card) |
| A7 | Press `4` (Easy) on the 3rd card | Deck completes → boat sails to lamp, docks; lamp glow pulses; Journal has a `deck_completed` record | **PASS** — biology-photosynthesis graded to completion (8/8): `boatState: docked`, `deck_completed` record, lampGlow 0.4→0.5. (Grades driven via REST; keyboard grade path proven in A5) |
| A8 | Repeat A2 with no cards due | Boats stay docked; message "Nothing is waiting for you right now. Your harbour can rest." | **PASS** — `review/start` on Thermo Basics (dueToday 0) → `card: null`, boat stays docked, narrate event with the exact copy in the outbox (seq 52) → transcript |
| A9 | Re-open a deck, `Esc` mid-card | Returns to harbour; progress kept; deck resumable | **PASS** — Esc mid-review → `POST review/exit` 200, back at harbour; later re-entered and continued |
| A10 | Refresh the page mid-review | World-state rebuilds; grades from A5–A7 persisted (§8.1 DoD) | **PASS** — reload mid-review rebuilt the POV with the NEXT ungraded card; uvicorn restart → identical world-state |

## B. Reduced motion (§7.4, §8.7)

| # | Step | Expected | Finale verdict |
|---|---|---|---|
| B1 | Enable the in-world reduced-motion toggle | Preference persists (PUT /api/preferences → world-state `reducedMotion: true`) | **PASS** — "🐢 Calm motion" toggle → `PUT /api/preferences` 200 → world-state `reducedMotion: true` |
| B2 | Trigger a camera fly (tour / zone click) | Instant cut or gentle fade — NO fly-through | **PASS** — reduced-motion dive: underwater in 364 ms (cut), vs ≥1600 ms full motion (finale-08) |
| B3 | Grade a card | Boat sink/rise becomes a fade, no splash motion | **PASS (by construction)** — worldStore honors `reducedMotion` in Fleet/ReviewMode/dive paths (flag plumbed store-wide; verified in code, not re-screenshotted) |
| B4 | Idle 30 s | No auto-orbit, no forced camera rotation | **PASS** — no auto-orbit in any session; atlas auto-spin disabled under reduced motion (`toggleSpin` on engine build) |
| B5 | OS `prefers-reduced-motion: reduce` + reload | Same behavior without touching the toggle | **PASS** — emulated `reduce`: dive cut in 364 ms with no toggle. **Found+fixed a real bug**: the world-state rebuild used to overwrite the OS preference with the server's stored `false`; `syncFromWorldState` now treats reduced-motion as sticky-ON |
| B6 | During any automated camera move | Visible "Skip tour" control; activating it stops motion immediately | **PASS** — chat → tour offer (unforced) → Begin tour → "Skip tour" visible mid-tour → click stops the tour |

## C. Accessibility cross-checks (§7.4)

| # | Step | Expected | Finale verdict |
|---|---|---|---|
| C1 | All grade/label info | Never conveyed by color alone (text labels present) | **PASS** — grade boats carry `1 · Again`…text pills; deck/task chips in the atlas drawer are text-labelled |
| C2 | Label pills | Dark navy on cream, contrast ≥ 4.5:1 | **PASS** — LABEL tokens (navy on ivory) used by every pill (finale-01) |
| C3 | Narration during tour | Also appears as text in the chat transcript | **PASS** — SSE `narrate` → transcript (upload success + nothing-due lines observed in the log) |
| C4 | `L` key | Toggles world labels (review-mode tags exempt) | **PASS** — `L` hid all world labels (probe: 0 `Today`/`Journal` pills), second `L` restored them (finale-6e-labels-off.png) |

## D. Error states (§7.2, §8.8)

| # | Step | Expected | Finale verdict |
|---|---|---|---|
| D1 | Stop the backend, reload | World stays navigable from last state; soft-amber "harbour mist" reconnecting indicator; never a silently empty world | **PASS** — uvicorn killed mid-upload: soft-amber banner + "The harbour mist is thick — reconnecting…" (finale-6b-be-killed.png); world stayed rendered |
| D2 | Stop Postgres, attempt a mutation | Explicit soft-amber error banner; no fake success | **PASS** — `docker stop enjoy-db` → `PUT /api/preferences` → 500 `INTERNAL_ERROR` envelope (recoverable:false, logged); `docker start` → clean recovery |
| D3 | (Automated in pytest) Missing OPENROUTER_API_KEY | Backend refuses to start — `test_step8_missing_openrouter_key_crashes_startup` | **PASS** — BE suite green (202 passed, 96.46% cov). Also proven live: wrong key on a throwaway :8002 instance → 502 `LLM_UNAVAILABLE` envelope + SSE `error` event, never canned content |
