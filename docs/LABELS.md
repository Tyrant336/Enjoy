# LABELS — World Label System & Toggle (FE Spec)

> Feature spec for the cream pill labels in the ocean world ("Today", "Journal",
> deck names like "Cell Division 1", card questions, grade buttons).
> Labels must be **toggleable**: the user can turn all world labels **on and off**.
> Visual design of the pills themselves: see the local visual-reference pack (gitignored) §7
> (cream `#F7F1DE` pill, navy `#1A203B` text, soft shadow, rounded sans).
> Comfort rules from `REQUIREMENTS.md` §2 / NFR-1 apply to every transition below.

---

## 1. What counts as a label

| Label type | Examples | Toggled by the master switch? |
|---|---|---|
| World object labels | "Today" (fishboat), "Journal" (lamp) | ✅ yes |
| Deck labels | "Cell Division 1"… on small boats | ✅ yes |
| Subtask labels | schedule subtasks around the fishboat | ✅ yes |
| Review-mode card tag | the current question above the boat | ⚠️ see §4 (always on during review) |
| Grade-button tags | Again / Hard / Good / Easy | ⚠️ see §4 (always on during review) |
| The toggle control itself | UI button, not a world label | n/a — always visible |

## 2. The toggle (FR-L1)

- **FR-L1.1** One global **label visibility state**: `labelsVisible: boolean`. Default: **ON**.
- **FR-L1.2** The user can flip it three ways — all equivalent, one shared state:
  1. A small **UI button** (in the top-right ViewPanel, cream chrome style,
     tag emoji, text "🏷 Labels"). It must follow the palette (cream/navy, no red, ever).
  2. **Keyboard shortcut:** `L` (and it must not fire while typing in the chat box).
  3. **Chat command:** typing "labels off" / "hide labels" / "labels on" to the
     Orchestrator sets the same state (Orchestrator emits the toggle command like
     any other FE command, per FR-5.4).
- **FR-L1.3** State is **one boolean in one place** (the FE world-state store).
  Every label component reads it — no per-label hacks, no second source of truth.
- **FR-L1.4** Persist the choice (localStorage) so it survives reload.

## 3. Transition behaviour (FR-L2) — comfort rules apply

- **FR-L2.1** Labels never pop in/out instantly. Toggling plays a **soft fade +
  slight rise/settle** (≈ 0.4–0.6 s, eased) — same gentleness as all motion in the
  world (NFR-1: no abrupt changes).
- **FR-L2.2** Hidden labels are fully non-interactive (no invisible click targets)
  and removed from the render path (not just `opacity: 0` left running).
- **FR-L2.3** Toggling off must not move or re-layout anything else in the world —
  the scene stays pixel-identical minus the pills.
- **FR-L2.4** The toggle button itself gives soft feedback (gentle state change,
  no flashing).

## 4. Mode exceptions (FR-L3)

- **FR-L3.1 Review mode (first-person boat POV):** the **question tag** and the
  **4 grade tags** (Again/Hard/Good/Easy) are **always visible regardless of the
  toggle** — they are gameplay UI, not world decoration. Hiding them would break
  reviewing. They still fade in/out gently when entering/leaving review mode.
- **FR-L3.2 Orchestrator tour:** while the narrator is explaining an object
  (FR-5.3 tour), that object's label is **temporarily shown even if labels are
  off** (it is part of the narration), then fades back out when the tour moves on.
- **FR-L3.3 New content:** when a new deck boat spawns or a new subtask appears,
  its label follows the current toggle state (no surprise pop-ups when labels are
  off — the boat appears, its label respects the switch).

## 5. Acceptance checks

1. Press `L` (or the button) → all world pills ("Today", "Journal", deck labels,
   subtasks) fade out together; press again → fade back in.
2. With labels OFF: entering review mode still shows question + grade tags.
3. With labels OFF: starting an orchestrator tour shows each toured object's
   label only while it's being explained.
4. With labels OFF: nothing in the world shifts position; no invisible click
   areas remain.
5. Reload the page → the last toggle state is remembered.
6. No red, no abrupt motion, pill styling matches the locked visual spec.
