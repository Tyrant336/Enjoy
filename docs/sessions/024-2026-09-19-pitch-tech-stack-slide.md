# 024 — 2026-09-19 — Pitch deck: tech-stack + open-source slides

## Goal
Owner presents the hackathon pitch in 2 minutes. Slide 7 ("Under the hood") didn't
mention the multi-agent system or LangChain/LangGraph. Replace it with a one-page
tech-stack slide: 3 talking points on top (owner speaks these), full stack list below.

## What was done (part 1 — S7 tech stack)
- Edited `docs/presentation/make_pptx.py` S7 only; regenerated
  `docs/presentation/enjoy-pitch.pptx` (still 8 slides).
- New S7 "TECH STACK ⚙️ / Why this stack 🧰":
  - Top row (talking points): 🤖 Multi-agent system → higher quality ·
    🦜🔗 LangChain → guides the AI · 🕸️ Three.js → the 3D game world.
  - Bottom "THE FULL STACK" list (verified against `frontend/package.json`,
    `Backend/pyproject.toml`, `docker-compose.yml`):
    - Frontend: Next.js 16 · React 19 · TypeScript · Three.js + react-three-fiber · Zustand · Tailwind CSS
    - Backend: Python 3.12 · FastAPI · Pydantic · multi-agent (orchestrator · planner · flashcards) · LangChain/LangGraph · SSE
    - Data & infra: PostgreSQL 16 · SQLAlchemy async · Alembic · Docker Compose · event-sourced world state
- Speaker notes updated: talk only the top 3, point at the list.

## Decisions / notes
- Slide lists "LangChain / LangGraph": owner says "LangChain" aloud; repo stack is
  LangGraph per AGENTS.md §0 (planner currently template-based; LangGraph
  plan-execute-replan internals land in P1 per `planner.py` docstring).
- Verified by execution: script ran, slide 7 text re-extracted from the .pptx and matches.

## What was done (part 2 — S8 open-source credits)
- Owner asked for an end-of-deck slide on the open source each agent builds on.
  Source of truth: `opensource/README.md` (grouped by agent). Added new S8
  "STANDING ON OPEN SOURCE 💙" (DEEP_TEAL, 3×2 chip grid): scheduler → LangGraph
  plan-and-execute / obsidian-magic-tasks / study-revision-planner · flashcards →
  anki-llm-flashcard-generator (forked) / py-fsrs / genanki · KG →
  langchain-experimental / nano-graphrag / KeyBERT · orchestrator →
  fastapi-langgraph-template / langgraph-swarm · world → stylized-water /
  camera-controls / underwater-atlas engine · assets → Kenney CC0 / custom Blender
  fishboat + lamp buoy. Footer points to `opensource/README.md`.
- Closing slide is now S9; deck = 9 slides. `docs/presentation/SCRIPT.md` updated
  (slide count, S7 wording, S8 marked not-spoken/credit slide, S9 closing).

## State at end
Deck ready — 9 slides: S1 title · S2 problem · S3 offer · S4–S6 demos ·
S7 tech stack · S8 open-source credits · S9 closing. To regenerate after edits:
`Backend/.venv/Scripts/python.exe docs/presentation/make_pptx.py`
(close PowerPoint first — the .pptx is overwritten).
