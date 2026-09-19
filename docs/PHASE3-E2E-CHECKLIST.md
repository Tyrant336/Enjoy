# Phase 3 E2E Checklists — browser-level steps (Agent S prep, session 017)

> These are the **browser halves** of the REQUIREMENTS §8 demo script that
> pytest cannot drive (no browser driver in v1 — if the monitor approves
> Playwright later, these become automated). Run them in Phase 3 against the
> seeded world. The backend halves are already in
> `Backend/tests/test_e2e_demo.py`. Every step is binary: PASS / FAIL + note.

## A. Keyboard-only 3-card review (§8.3/§8.7, FR-2.5, §7.4)

Precondition: seeded world; "Thermo 1" boat circling (3 cards due). **Mouse put
aside — keyboard only.**

| # | Step | Expected |
|---|---|---|
| A1 | `Tab` through the world | Focus lands visibly on boat labels (focus ring, no red) |
| A2 | `Enter` on the "Thermo 1" label | Camera glides into boat POV (≥1500 ms, eased); question pill appears |
| A3 | `Tab` → "Reveal answer", `Enter` | Answer pill fades in beneath the question |
| A4 | 4 grade boats visible | Again / Hard / Good / Easy, all pastel, "Again" soft amber, each text-labelled |
| A5 | Press `3` (Good) | Grade persists (network PUT/POST 200); clicked boat sinks gently (700–1200 ms); next card's boat rises |
| A6 | Press `1` (Again) | Same sink/rise; card NOT re-shown this session (FR-2.9) |
| A7 | Press `4` (Easy) on the 3rd card | Deck completes → boat sails to lamp, docks; lamp glow pulses; Journal has a `deck_completed` record |
| A8 | Repeat A2 with no cards due | Boats stay docked; message "Nothing is waiting for you right now. Your harbour can rest." |
| A9 | Re-open a deck, `Esc` mid-card | Returns to harbour; progress kept; deck resumable |
| A10 | Refresh the page mid-review | World-state rebuilds; grades from A5–A7 persisted (§8.1 DoD) |

## B. Reduced motion (§7.4, §8.7)

| # | Step | Expected |
|---|---|---|
| B1 | Enable the in-world reduced-motion toggle | Preference persists (PUT /api/preferences → world-state `reducedMotion: true`) |
| B2 | Trigger a camera fly (tour / zone click) | Instant cut or gentle fade — NO fly-through |
| B3 | Grade a card | Boat sink/rise becomes a fade, no splash motion |
| B4 | Idle 30 s | No auto-orbit, no forced camera rotation |
| B5 | OS `prefers-reduced-motion: reduce` + reload | Same behavior without touching the toggle |
| B6 | During any automated camera move | Visible "Skip tour" control; activating it stops motion immediately |

## C. Accessibility cross-checks (§7.4)

| # | Step | Expected |
|---|---|---|
| C1 | All grade/label info | Never conveyed by color alone (text labels present) |
| C2 | Label pills | Dark navy on cream, contrast ≥ 4.5:1 |
| C3 | Narration during tour | Also appears as text in the chat transcript |
| C4 | `L` key | Toggles world labels (review-mode tags exempt) |

## D. Error states (§7.2, §8.8)

| # | Step | Expected |
|---|---|---|
| D1 | Stop the backend, reload | World stays navigable from last state; soft-amber "harbour mist" reconnecting indicator; never a silently empty world |
| D2 | Stop Postgres, attempt a mutation | Explicit soft-amber error banner; no fake success |
| D3 | (Automated in pytest) Missing OPENROUTER_API_KEY | Backend refuses to start — `test_step8_missing_openrouter_key_crashes_startup` |
