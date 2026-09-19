# RESEARCH — Emotional Comfort & Time-Saving by Design

> Research backing the two promises in `docs/plan.md`:
> **🕊️ emotional comfort** and **⏳ time saving**.
> Sources: app analysis (Finch, goblin.tools, Calm/Headspace, Forest, Tiimo) +
> learning-science literature (time management, procrastination, spaced repetition,
> cognitive load). Every finding is mapped to a **concrete suggestion** for our app
> and marked **[v1]** (already in `docs/REQUIREMENTS.md`), **[polish]** (Phase 7
> candidates), or **[stretch]** (post-hackathon ideas — NOT v1 scope).

---

## Part 1 — What emotionally comforting apps do (and what we steal)

### 1.1 goblin.tools — comfort through *smaller steps*
- **What it does:** turns "one big scary task" into tiny steps (Magic ToDo), with a
  "spice level" slider controlling how much breakdown help you get. Free, no
  account, no ads, opens instantly to the tool you need.
- **Why it comforts:** it removes *executive dysfunction* pressure — the anxiety
  isn't the task, it's not knowing where to start. Low-friction UX (no setup, no
  menus) respects an already-overloaded brain.
- **For us:** [v1] our fishboat IS this (FR-1, spice-level breakdown). **Steal:**
  goblin.tools has *no calendar, no tracking* — we add gentle scheduling on top,
  which is our differentiator. Keep their zero-friction entry: **the chat box is
  the whole onboarding. No forms, no setup wizard.** [polish]

### 1.2 Finch — comfort through *unconditional gentleness*
- **What it does:** self-care pet companion; gentle nudges, emotional check-ins,
  rewards small wins. Crucially: **no punishment loops** — miss a day, nothing
  breaks, the pet is just happy you're back.
- **Why it comforts:** guilt is the #1 reason students abandon study apps
  (streak-loss anxiety). Finch proves you can motivate without threat.
- **For us:**
  - [polish] **No streak counters, no "you missed 3 days" — ever.** The lamp
    (FR-4) records victories only. A returning student sees "welcome back, the
    boats waited for you", never a debt.
  - [polish] Celebration copy is warm, not gamified-pressure ("You did it" not
    "Keep your streak!") — already in FR-2.6; extend to ALL copy.
  - [stretch] A tiny check-in ("how does this task feel?") before breakdown, like
    goblin.tools' Estimator — lets the schedule adapt to the student's emotional
    state, not just the deadline.

### 1.3 Calm / Headspace — comfort through *sensory design*
- **What they do:** slow audio, nature soundscapes, soft palettes, breathing
  pacing. Nothing moves fast; nothing shouts.
- **Why it comforts:** the nervous system responds to pacing before content —
  slow motion + soft sound *is* the message.
- **For us:** [v1] NFR-1 already mandates eased ≥1.5s transitions and soft/optional
  sound. **Steal:** [polish] a **2-second ambient moment** when the world loads
  (water sound fades in, camera settles) before any UI appears — the app breathes
  before it asks. [stretch] one gentle breath-pause animation before a big tour
  starts.

### 1.4 Forest / Tiimo — comfort through *visible, kind structure*
- **Forest:** focus = growing a tree; progress you can *see* without numbers.
- **Tiimo:** icon-based visual timeline for time-blindness; structure without text walls.
- **Why it comforts:** abstract progress (percentages, counts) creates comparison
  anxiety; *spatial* progress (a growing forest, a filling day) just feels like life.
- **For us:** [v1] this validates our entire world metaphor — the circling fleet IS
  a progress ring, the lamp IS a trophy shelf, the growing atlas IS a knowledge
  portfolio. **No dashboards, no charts in the world.** Progress is spatial. [v1]
  [stretch] lamp glow intensity = cumulative record (FR-4.3, already visual).

### 1.5 Cross-app pattern summary (the comfort formula)
| Pattern | Mechanism | Where ours lives |
|---|---|---|
| Shrink the scary thing | task breakdown removes start-anxiety | Fishboat (FR-1) |
| Never punish absence | no streaks, no debt, warm returns | Lamp copy (FR-4) |
| Slow everything down | pacing regulates emotion before content | NFR-1 motion rules |
| Make progress spatial | worlds, not dashboards | Fleet/lamp/atlas zones (FR-2.7) |
| One front door | zero setup, zero menus | Chat-only entry (FR-0/FR-5) |
| Warm light = safety | single warm accent in cool palette | Lantern `#FFFFC2` (locked palette) |

---

## Part 2 — The whole student process (journey map: where the time goes)

Studying is a pipeline. Students lose time and accumulate anxiety at every stage —
**mostly in the stages that are NOT learning:**

| # | Stage | What students actually do | Time/pain cost | Learning value |
|---|---|---|---|---|
| 1 | **Face the task** | Stare at "revise thermodynamics", feel dread, delay starting | 90% of college students procrastinate (est. W. Knause); procrastination ≈ failed self-regulation, not laziness | ❌ none |
| 2 | **Plan** | Decide what to study, in what order, for how long; build timetable | 30–60+ min per big task; planning quality explains ~47% of procrastination variance (Valente 2024, n=506) | ❌ none (but its *absence* causes cramming) |
| 3 | **Prepare materials** | Re-read notes, highlight, **hand-type flashcards**, draw concept maps | Card creation is the documented bottleneck: "students spend more energy preparing cards than studying them" (Memdora, arXiv 2026); reports of 2h → 5 min when automated | ❌ mostly clerical |
| 4 | **First-pass learning** | Read/watch, try to understand | Necessary time — but often wasted on passive re-reading (weakest method) | ✅ this is learning |
| 5 | **Practice & memorize** | Retrieval practice, spaced review | Highest-value time; spaced repetition: ~80% vs ~60% recall vs cramming; 0.3–0.5 SD effect; med students 88% vs 78% | ✅ this is learning |
| 6 | **Review scheduling** | Decide *when* to review what (forgetting curve math) | Done by hand: impossible; done poorly: re-studying known things, forgetting weak ones | ❌ pure logistics |
| 7 | **Self-assessment** | "What do I actually know? What's connected to what?" | Rarely done — no tools; students discover gaps in the exam | ⚠️ valuable but skipped |

**The headline finding:** stages 1, 2, 3, 6 — the stages with **zero learning
value** — consume a large share of a student's study life and generate **most of
the anxiety**. That is exactly the time our app gives back.

**Automation principle (cognitive load theory):** AI should absorb *extraneous
load* (formatting, scheduling, logistics) so the student's limited attention goes
to *germane load* (understanding, retrieval). Never automate stage 4/5 thinking —
automate everything around it.

---

## Part 3 — Time-saving automation map (stage → our agents)

| Stage | Manual cost | Our automation | Status |
|---|---|---|---|
| 1. Face the task | dread, delay | Empathetic acknowledgment + instant breakdown → start-anxiety dissolves (fishboat, FR-1.1) | [v1] |
| 2. Plan | 30–60 min/task | Task breakdown + timetable sized to user input, in seconds (FR-1); long-term planning is the proven anti-procrastination lever (β=−0.72) | [v1] |
| 3. Prepare materials | hours/deck | One upload (PDF/PPTX/DOCX/MD) → Anki deck (FR-2) AND concept graph (FR-3) from the SAME ingestion — one gesture, two tools (mirrors Memdora's "single gesture at point of reading") | [v1] |
| 6. Review scheduling | impossible by hand | FSRS scheduling drives the circle-around-the-lamp = today's queue (FR-2.4); FSRS ≈ up to 30% more efficient than SM-2 (fewer reviews for same retention) | [v1] |
| 7. Self-assessment | skipped | Underwater atlas makes gaps/connections visible; node links back to cards+tasks (FR-3.4) | [v1] |
| 2b. Re-plan when life happens | schedule rots | [stretch] Scheduler re-plans when tasks slip — "it's okay, the fishboat moved things around" — replanning framed as kindness, not failure | [stretch] |
| 3b. Card quality control | AI cards can be vague | [polish] one-gesture edit/delete on generated cards before they join the fleet (AI = first pass, student = editor — best-practice pattern across apps) | [polish] |
| 4b. Understanding check | passive re-reading | [stretch] click an atlas node → "quiz me on just this" (spawns a mini-review from linked cards) | [stretch] |
| 5b. Micro-sessions | needs big time blocks | [polish] "I have 10 minutes" → narrator serves exactly what fits: the circle shrinks to 3 cards | [stretch] |
| Capture | re-typing notes | [stretch] paste/photo/YouTube-audio ingestion (transcript → cards); voice input to orchestrator (FR-5.1 already marks voice as stretch) | [stretch] |

---

## Part 4 — Top recommendations (prioritized)

**Do these in v1 polish (Phase 7) — cheap, high comfort/time payoff:**
1. **Zero-friction entry:** chat box is the entire onboarding. No account, no setup. (§1.1)
2. **Copy audit against the comfort formula:** no streaks, no red, no debt
   language, warm returns. One pass over every string. (§1.2)
3. **The 2-second ambient load moment** before UI appears. (§1.3)
4. **One-gesture card editing** before decks join the fleet. (§3, 3b)
5. **Demo line that quantifies the time promise**: "a deck that took 2 hours by
   hand, made in ~1 minute; a plan that took an evening, made before the water
   settles." Judges remember numbers. (§2)

**Keep as stretch (say them out loud as "roadmap" in the pitch):**
6. Adaptive re-planning when tasks slip (framed kindly). 7. Emotional check-in
adjusting breakdown depth. 8. "I have 10 minutes" micro-sessions. 9. Node-level
"quiz me on this". 10. Voice + YouTube/audio ingestion.

**Never do (anti-patterns the research warns about):**
- ❌ Streaks, leaderboards, XP pressure (DeckStudy-style) — conflicts with promise #1.
- ❌ Dashboards/charts in the world — progress stays spatial. (§1.4)
- ❌ Automating the thinking itself (auto-answering, summaries instead of retrieval) —
  saves time by destroying learning; violates the cognitive-load principle. (§2)

---

## Sources (selected)
- Saner.ai (2026), *Best Neurodivergent Apps* — app pattern analysis: goblin.tools, Finch, Tiimo, Forest, Headspace.
- Valente et al. (2024), *Planning Time Management… and Procrastination*, Sustainability 16(6883), n=506 — planning explains ~47% of procrastination variance; long-term planning β=−0.72 vs daily-study procrastination.
- Preprints 2024, *Students' Self-Regulated Learning* — time management → self-regulation → less procrastination (η²≈0.69).
- Fu (2025), PMC11967054 — time management correlates with study engagement (r=0.365).
- Memdora (2026), arXiv:2607.25096 — card-creation friction documented as SRS adoption killer; single-gesture creation pattern; FSRS-6.
- AskSia / DeckStudy / STURIO product data — FSRS vs SM-2 efficiency (~30%), 2h→5min creation-time reports, AI-first-pass + human-edit pattern.
- TheScienceTalk (2025) — AI flashcards match teacher-made materials; SRS 80% vs 60% recall vs cramming; 88% vs 78% (med ed); cognitive-load framing.
- William Knause estimate via PTC.edu — ~90% of college students procrastinate; ~25% chronic.
