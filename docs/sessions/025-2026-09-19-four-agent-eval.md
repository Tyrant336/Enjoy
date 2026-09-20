# Session 024 — Four-Agent Evaluation (Orchestrator, Scheduler, Flashcard-Gen, KG-Gen)

**Date:** 2026-09-19 · **Goal:** Owner asked to generate 3 test PDFs + 10 task inputs,
run them against the four-agent system, rate usefulness, and recommend
LangGraph/LangChain changes.

## Headline finding (loud, per §2)

**Only 2 of the 4 agents exist.** No LLM is called anywhere in `Backend/` — P0 is
deterministic by design (FR-0.3 / FR-1.5 P0):

| Agent | Exists? | What was tested |
|---|---|---|
| Orchestrator | ✅ deterministic keyword router | 10 chat inputs via real `POST /api/chat` |
| Scheduler (big-task breakdown) | ✅ deterministic template planner | 10 chat plans + 5 direct plan calls |
| Flashcard **generator** | ❌ **P1, not built** | probes: all 404 / module MISSING |
| KG **generator** | ❌ **P1, not built** | probes: all 404 / module MISSING |

The PDFs cannot be ingested — there is **no upload endpoint and no PDF parser**
(anywhere: no docling/pypdf dep, no `app/services/ingestion`). The 3 PDFs + `.txt`
twins live at `Backend/.scratch/agent-eval/pdfs/` ready for the P1 pipeline.
What exists for flashcards/KG is the *other half*: review loop + seeded-graph read
path, both verified working (`GET /agents/flashcards/today` → deck "Thermo 1",
3 cards/3 due; `GET /agents/kg/graph` → 48 nodes / 96 links from the seed fixture).

## Method (nothing mocked)

- Real FastAPI ASGI app, real Postgres `harbour` (docker `enjoy-db`), seed user
  `user-seed-01`. Scripts: `.scratch/agent-eval/make_pdfs.py` (pure-stdlib PDF
  writer, no new deps), `.scratch/agent-eval/run_eval.py`; raw data in
  `.scratch/agent-eval/results.json`.

## Test PDFs

1. `biology-photosynthesis.pdf` — definitions, master equation, 2-stage process, confused pairs, practice Qs
2. `history-french-revolution.pdf` — causes, 1789–99 timeline, figures, glossary, exam prompts
3. `cs-neural-networks.pdf` — perceptron, activations, loss functions, backprop, training pipeline, overfitting

## A. Orchestrator results (10 inputs)

| # | Input (abridged) | Route | Verdict |
|---|---|---|---|
| C01 | "I'm overwhelmed — calculus exam in 5 days…" | big_task | ✅ correct route; ⚠️ goal NOT cleaned (see D1) |
| C02 | "Learn the basics of Python programming" | big_task | ✅ |
| C03 | "Show me my flashcard decks" | direct_zone:small_boat | ✅ |
| C04 | "Take me to the underwater atlas" | direct_zone:underwater | ✅ |
| C05 | "Open my journal" | direct_zone:lamp | ✅ |
| C06 | "hello" | narrate | ✅ no fake plan |
| C07 | "…organic chemistry midterm next month" | big_task | ✅ route; ⚠️ "next month" ignored (D2) |
| C08 | "fishboat, schedule my revision week" | direct_zone:fishboat | ✅ precedence right; ⚠️ zone word leaks into goal (D3) |
| C09 | "Help me understand photosynthesis and drill my flashcards" | direct_zone:small_boat | ⚠️ rule-correct but drops the learning need (D4) |
| C10 | "I'm scared of my driving theory test" | big_task | ✅ prefix stripped → goal "my driving theory test" |

**10/10 routed per FR-0 rules.** Deterministic, fast, predictable.

## B. Scheduler results

- Granularity sweep (linear algebra): 3/6/15 tasks, 55/135/290 min, packed
  greedily into 2 h/day from today. ✅ contract holds.
- P04 tight deadline (10 tasks, 3 days, 1.5 h/day): deadline wins over hours cap,
  spread 2026-09-19→21. ✅ documented behavior.
- P05 past deadline (2020): ignored as unmeetable, schedules from today. ✅ documented.
- Every plan carries exactly 1 deck request, hardcoded to template index 2
  ("Explain the core ideas…") regardless of topic.

## Defects / gaps found (for backlog)

- **D1 — emotional-prefix list too short:** "I'm overwhelmed" (and likely
  "stressed", "panicking") is not in `_GOAL_PREFIXES`, so the goal becomes the
  whole raw message, including "and I haven't started". Empathy line then reads
  awkwardly truncated.
- **D2 — no date understanding:** "in 5 days" / "next month" are ignored; plan
  always starts today at default 2 h/day. `scripts/seed_dates.py` has a
  date-token resolver — it is not wired into the planner.
- **D3 — zone words pollute the goal:** C08's goal is literally
  "fishboat, schedule my revision week" → task titles read
  "Map the big picture of fishboat, schedule my revision week".
- **D4 — topic + single zone drops the topic:** C09 names small_boat once, so the
  router goes direct-zone and the actual request ("understand photosynthesis")
  gets only an ack — no plan, no deck. Rule-correct per FR-0.1, usefulness-poor.
- **D5 — topic-agnostic templates:** "bar exam", "linear algebra" and "juggling"
  get the *identical* 15-step skeleton with the noun swapped. Fine for P0 demo;
  not real breakdown quality.
- **D6 — slots repeat within a day:** with >3 tasks/day, slot cycles back to
  "morning" (4th task same day = morning again). Cosmetic, but visible.

## Usefulness ratings (as tested, P0 scope)

| Agent | Rating | Justification |
|---|---|---|
| Orchestrator router | **6.5/10** | 10/10 rule-correct, warm acks, narrate path honest; loses points for D3/D4 and zero handling of ambiguity beyond "everything is a big task". |
| Scheduler breakdown | **5.5/10** | Solid contract & scheduling math (deadline logic genuinely good); tasks are Mad-Libs templates (D5), no date parsing (D2), fixed deck-request slot. Great scaffolding, generic content. |
| Flashcard generator | **0/10 — does not exist** | Only review half (fixed intervals, no FSRS) exists. Untestable as a generator. |
| KG generator | **0/10 — does not exist** | Only read path over seeded fixture exists. Untestable as a generator. |

## LangGraph / LangChain recommendations (P1 build order)

1. **One shared LLM client wrapper first** (AGENTS.md §3.1): a single
   `app/core/llm.py` around `langchain-openai`'s `ChatOpenAI` pointed at
   `OPENROUTER_BASE_URL` with the key from settings. Everything else hangs off it.
   Use **Pydantic structured output** (`with_structured_output`) for every agent —
   parse by key, hard error on mismatch (§2.4). Vision-capable model only — the
   configured `deepseek-v4.1-flash` must be checked against the `.env.example`
   warning (DeepSeek text-only models cannot process PDF page images).
2. **Ingestion pipeline before both generators** (REQUIREMENTS §4.1: ONE shared
   pipeline for FR-2 + FR-3): `POST /api/ingest` → Docling parse → chunk →
   fan-out to flashcard-extract and KG-extract nodes. As a LangGraph
   `StateGraph` with a typed `IngestState` (doc_id, chunks, cards, nodes, edges,
   errors). Use **Postgres checkpointer** (`langgraph-checkpoint-postgres`) so a
   25 MB PDF job is resumable instead of silently lost.
3. **Scheduler → plan-execute-replan** (the module docstring already names this):
   replace `_TASK_TEMPLATES` with an LLM planner node emitting the *same*
   `StudyPlan` contract (contract stays — frontend untouched). Add a
   **goal-extraction node** (fixes D1/D3) and wire `seed_dates.py`'s resolver as
   a **date-parsing tool/node** (fixes D2). Keep granularity as a
   "target task count" constraint in the prompt, validated after generation.
4. **Orchestrator LLM supervisor as a fallback node, not a parallel path**
   (FR-0.3, §3.3): keep `route_message` as the first cheap node; conditional edge
   to an LLM classifier only when 0 zones AND low confidence (e.g. C09's mixed
   intent, D4). One graph, one path — no `if llm:` branches.
5. **KG extractor**: structured-output node producing `KGNode`/`KGLink` batches
   validated against `app/schemas.py` types; dedupe/merge node (label
   normalization) before persist; FR-3.2's KeyBERT/YAKE fallback is allowed but
   must log WARNING + surface in API response (§2.1 exception).
6. **Observability:** structured logs per node (who/what/why, §2.6); LangSmith
   tracing optional via env — off by default, never a code branch.
7. **Anti-patterns to avoid:** no `DEMO_MODE` (§3.4), no regex-parse fallback of
   LLM output (§2.1), no second router/planner "v2" (§3.1), no mocking the DB in
   the new tests (§6.5) — ingestion tests run against scratch Postgres with small
   fixture PDFs (the 3 from this session can become fixtures).

## State at end of session

- Dev DB re-seeded clean after eval; `harbour` at migration 001.
- Eval artifacts (gitignored): `Backend/.scratch/agent-eval/{make_pdfs.py,run_eval.py,results.json,pdfs/}`.
- No product code changed. No docs/rules changed beyond this session file.
