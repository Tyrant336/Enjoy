# PLAN — *enjoy* (AI Navigation World)

> Non-technical project plan. This file keeps the team **on track**.
> The *what* lives in **`docs/REQUIREMENTS.md`** (single source of truth — read it first).
> The *how* lives in **`AGENTS.md`** (coding rules for every AI agent).
> The *build order & team hats* live in **`docs/BUILDING.md`** (monitor + S/T/L hats).
> The *ingredients* live in **`opensource/`** (vetted code, one folder per agent).
> The *evidence* lives in **`docs/RESEARCH.md`** (why comfort + time-saving work,
> with prioritized improvement suggestions).
>
> Hackathon goal: **automate students' study work** inside a cozy Townscaper-style
> ocean world.
>
> **This app makes two promises, in this order:**
> 1. 🕊️ **Emotional comfort** — a safe harbour for stressed students. No guilt, no
>    urgency, no red. The world calms you down before it asks anything of you.
> 2. ⏳ **Time saving** — the AI does the boring half of studying (planning,
>    card-making, note-connecting, deciding what to do next) so the student only
>    does the part that actually teaches them: reviewing and understanding.
>
> Every feature below must serve at least one promise — ideally both.

---

## 0. The One-Sentence Product

A student says *"I'm afraid of revising thermodynamics"* → an AI Orchestrator
breaks it down, and a calm ocean world gives them a **schedule** (fishboat),
**flashcards** (small boats), and a **knowledge atlas** (underwater) — then flies
their camera through it all like a game intro, every time there's a new task.

**What the student no longer spends time on:** breaking a scary goal into steps,
building a timetable, typing flashcards by hand, drawing concept maps, figuring
out what to do next. **What they're left with:** a calm mind and a clear next
small step.

## 1. The World Map (who is who)

| In the world | Means | Powered by | Open-source home |
|---|---|---|---|
| 🛳️ Fat **fishboat** ("Today") | Study scheduler: big scary task → small tasks → timetable | Scheduler Agent | `opensource/01-scheduler-fishboat/` |
| ⛵ **Small boats** (leader + fleet) | Anki flashcard decks ONLY (never tasks!) | Flashcard Agent | `opensource/02-anki-smallboats/` |
| 🌊 **Underwater** scene | Knowledge atlas: keyword nodes connected as a glowing web | Knowledge Graph Agent | `opensource/03-knowledge-graph/` (extraction) + `07-underwater-atlas/` (rendering) |
| 🏮 **Lamp buoy** ("Journal") | Record of the past — celebrates small victories | Records store | (part of backend) |
| 🧭 **Narrator** (voice + camera) | Guide that routes, navigates, explains | Orchestrator Agent | `opensource/04-orchestrator/` |
| 🎨 The ocean world itself | Above/under water, boats, lamp, labels | Frontend | `opensource/05-frontend-world/` + `06-assets-cc0/` |

**Zone meaning (locked):** circling the lamp = *to finish today* · lamp = *finished
& recorded* · underwater = *review & connect*.

## 2. Golden Rules (never broken)

1. **Emotional comfort first** — slow eased motion, warm words, no guilt, no urgency.
   When comfort and a feature conflict, comfort wins.
2. **Save the student's time, visibly** — automation must be faster than doing it
   by hand *and feel that way*: no busywork, no re-typing, no waiting without a
   gentle explanation. If a flow doesn't save time, cut it.
3. **No red anywhere** — not in UI, not on boats, not in errors (use soft amber/teal).
4. **The locked visual spec is law** — same palette, same outlines, same
   shadows/reflections, same composition. No sideways redesigns.
5. **Small boats = flashcard decks only.** Schedule tasks live on the fishboat.
6. One orchestrator, three specialist agents — nothing else makes decisions.

## 3. Phases (product view — the BUILD ORDER is `docs/BUILDING.md`, phases 0–4)

> These are the product milestones in dependency order. The engineering plan
> (who builds what, when, exit tests) lives in **`docs/BUILDING.md`** — if the two
> ever disagree, BUILDING.md governs scheduling, REQUIREMENTS.md governs scope.

### Phase 1 — The World Stands Still ✅ foundation
- The ocean scene exists and **matches the background screenshots** (side-by-side check).
- Fishboat, lamp, a few small boats float with reflections; labels say "Today"/"Journal".
- Underwater scene exists (empty is fine) with the same palette family.
- **Checkpoint:** screenshot comparison passes, no red, 60fps, feels calm.

### Phase 2 — The Fishboat Thinks (Scheduler) ⏳ saves planning time
- Typing *"I'm afraid of revising thermodynamics"* produces: a warm one-line
  acknowledgment + small doable subtasks + a timetable sized to user input.
  (Time saved: the 30–60 min a student burns just *figuring out where to start*.)
- Subtasks appear as labels on/around the fishboat's "Today" view.
- Built by forking `01-scheduler-fishboat/` picks (plan-and-execute + study planner).
- **Checkpoint:** vague emotional input in → clear, seeable goals out (per sketch 2).

### Phase 3 — The Small Boats Carry Cards (Flashcards) ⏳ saves card-making time
- Upload PDF / PPTX / DOCX / text → decks of Q/A cards. **One deck = one boat.**
  (Time saved: hours of hand-typing cards — the #1 reason students quit Anki.)
- Decks export as real `.apkg` (Anki) files; cards also reviewable in-app.
- Fork `02-anki-smallboats/anki-llm-flashcard-generator` (pipeline) + `genanki` (export).
- **Checkpoint:** upload a document → new labelled boats join the fleet, `.apkg` downloads.

### Phase 4 — The Fleet Moves (World State & Review Mode)
- **Idle:** fishboat leads the fleet in a slow circle around the lamp = today's queue.
- **Review:** click a deck boat → camera becomes the boat (first-person, gentle bobbing)
  → question tag above → 4 grade boats ahead (Again/Hard/Good/Easy) → click grade →
  that boat sinks, next card's boat rises → done → fleet sails back, deck docks at lamp.
- **Checkpoint:** full review loop works, feels gentle, records the completion.

### Phase 5 — The Underwater Lights Up (Knowledge Graph) ⏳ saves note-connecting time
- Same uploaded documents → keyword nodes + connections, rendered as a glowing
  submerged web (bioluminescent, godrays, particles). No re-uploading — the same
  ingestion feeds cards AND the atlas (one upload, two study tools).
- Clicking a node shows its meaning + links to its flashcards and tasks.
- Fork `03-knowledge-graph/` picks (LLM extraction) + render with the locked
  three.js atlas engine (`07-underwater-atlas/`).
- **Checkpoint:** the atlas visibly grows as material is added ("the web the student is learning").

### Phase 6 — The Narrator Conducts (Orchestrator) ⏳ saves decision time
- One chat box (text; voice optional): routes to fishboat / small boat / underwater /
  journal on demand, or runs the **full pipeline** for a big new task.
  (Time saved: "what should I do now?" is answered before the student finishes typing.)
- Every new big task = a fresh **roadmap tour**: the camera flies fishboat → fleet →
  underwater (order adapts to the input) while the narrator warmly explains what's
  done and what to focus on. Cool, consistent animation (per sketch 3).
- Built on `04-orchestrator/` picks (LangGraph supervisor + FastAPI template).
- **Checkpoint:** the acceptance demo below runs end-to-end.

### Phase 7 — Polish & Demo Readiness
- Seed the deterministic Thermodynamics demo fixture (`REQUIREMENTS.md` §4.6),
  loaded deliberately via `DEMO_MODE=true` (works even if the LLM is slow).
- Final pass: palette check (no red), animation easing, warm copy, journal at the lamp.
- **Demo narration must state both promises out loud**: "this world keeps you calm"
  + "this world gave you back the hours you'd have spent planning and card-typing."
- Rehearse the demo script.

## 4. Acceptance Demo (the definition of "done")

1. Type *"I'm afraid of revising thermodynamics"* → warm reply + intro tour starts.
2. Camera flies to the **fishboat** → narrator explains the schedule, subtasks appear.
3. Camera glides to the **circling fleet** → "Thermo 1…N" boats join the circle;
   click one → first-person review with the 4 grade boats → finish → boat docks at lamp.
4. Camera dives **underwater** → the glowing atlas; click a node → see its card links.
5. The **lamp** glows brighter; "Journal" shows today's victory.
6. Typing just "fishboat" or "small boat" calls only that agent.
7. The whole scene matches the background screenshots. No red anywhere.

(Full detail: `REQUIREMENTS.md` §8.)

## 5. Team Roles

**Superseded by `docs/BUILDING.md` §2** (Monitor + S/T/L hats, rotating agents).
This table remains only as a product-level map of features → agents:

| Feature phase | Agent (product view) | Must read |
|---|---|---|
| Phases 1 & 4: world, boats, lamp, underwater, camera, review mode | **T hat** (3D world) | `REQUIREMENTS.md` §2, `frontend/AGENTS.md` |
| Phases 2, 3, 5, 6: scheduler, flashcards, KG, orchestrator logic | **L hat** (logic) | `REQUIREMENTS.md` FR-0–FR-5, `opensource/01–04/distill` |
| Scaffolding, seeds, tests | **S hat** (scaffold→support) | `docs/BUILDING.md` Phase 0 |

Everyone: **read `REQUIREMENTS.md` first, follow `AGENTS.md`, reuse — never reinvent —
what's already in `opensource/`.**

## 6. Risks & How We Stay on Track

| Risk | Mitigation |
|---|---|
| Time runs out (ours) | Phases are shippable in order: even Phase 1–3 alone demos well. Phase 6 tour is the wow-factor — protect time for it. |
| App feels slow → breaks the time-saving promise | Stream everything (narration, cards, graph); show gentle progress. If LLM is unavailable, a human deliberately demos with `DEMO_MODE=true` — never an automatic fallback (AGENTS.md §2). |
| Automation feels cold → breaks the comfort promise | Every agent reply starts with a warm human sentence; the lamp celebrates finished work; copy review at Phase 7. |
| Visual drift from reference | Side-by-side screenshot check at every phase, not just the end. |
| Red sneaks in via an asset | Check every model/texture before use; soft amber replaces "error red". |
| LLM slowness kills the demo | Deliberate `DEMO_MODE=true` + seeded Thermo fixture (§4.6) so the story works regardless — set by a human, never auto-fallback. |
| Agents disagree on data | All shared shapes are defined in `REQUIREMENTS.md` — one source of truth, no guessing. |
