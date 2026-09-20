# enjoy 🛳️

A calm, pastel, Townscaper-style 3D ocean world that automates students' study
work. Built for the **Automate Learning** hackathon.

Type something scary and big (*"I'm afraid of revising thermodynamics"*) and the
AI Orchestrator navigates you through a personalized learning roadmap embodied in
the world:

| World object | What it automates |
|---|---|
| 🛳️ Fishboat | Study schedule (task breakdown + timetable) |
| ⛵ Small boats | Anki flashcard decks |
| 🌊 Underwater scene | Knowledge graph atlas |
| 🏮 Lamp buoy | Journal of completed victories |

**The three Never-Dos** (hard rules, research-backed — see `AGENTS.md` §7,
`docs/RESEARCH.md`):
1. 🚫 **No pressure mechanics** — no streaks, leaderboards, XP, or "you missed N days" guilt.
2. 🚫 **No dashboards in the world** — progress is spatial (fleet, lamp, atlas), never charts.
3. 🚫 **Never automate the thinking itself** — AI handles planning/formatting/scheduling; the student does the learning.

## Stack

- **Backend** (`Backend/`): Python + FastAPI + LangGraph + PostgreSQL (Alembic migrations)
- **Frontend** (`frontend/`): Next.js + react-three-fiber
- **LLMs**: OpenRouter (default model: `deepseek/deepseek-v4.1-flash` — vision-capable)

## Documentation

| File | What it is |
|---|---|
| `AGENTS.md` | **Hard rules for all AI agents** — read first |
| `docs/REQUIREMENTS.md` | Product requirements — single source of truth (local-only, not committed) |
| `docs/BUILDING.md` | Build plan — team topology, phases, timeline for monitor + 3 builders |
| `docs/plan.md` | Non-technical project plan — keeps the team on track |
| `docs/sessions/` | Session logs — what was done, when, why |
| `docs/RESEARCH.md` | Research — emotional comfort + time-saving evidence & suggestions |
| `docs/LABELS.md` | Label system spec — world labels toggle on/off |
| `docs/presentation/` | Pitch deck (`enjoy-pitch.pptx` + `make_pptx.py` generator) and 2-min video script/shot list (`SCRIPT.md`) |
| `opensource/` | Vetted open-source building blocks + `distill/` integration specs |

## Setup

```bash
cp .env.example .env   # then paste your OpenRouter key into .env
```

## Run it

```bash
docker compose up -d db                                    # PostgreSQL on :5433
cd Backend && .venv/Scripts/python.exe -m scripts.seed     # seeded demo world
cd Backend && .venv/Scripts/python.exe -m uvicorn app.main:app --port 8000
cd frontend && npm run dev                                 # http://localhost:3000
```

The frontend auto-sends a `X-Harbour-User-Id` (localStorage UUID); the seed
script creates the demo user `user-seed-01` (fishboat + “Thermo 1” circling
deck + docked “Thermo Basics” + 48-node atlas).

## Current state

**P1 built and QA'd end-to-end** (session 030, `docs/sessions/030-2026-09-20-finale.md`):
upload a PDF/slides/notes via the 📎 in the chat bar → a flashcard-deck boat
joins the fleet and the underwater atlas grows (one upload feeds both agents);
click a deck boat to review (keyboard: `1–4` grade, `Esc` back); completing a
deck docks it at the lamp with a downloadable `.apkg` link; 🐢 Calm-motion and
🏷 Labels toggles persist via `PUT /api/preferences`. Backend suite: 202 passed,
96% coverage.

**Polish pass** (sessions 031–032): flotilla ring doubled (R=180) with small
boats trailing the fishboat astern; clicking a deck boat makes it **peel out**
of the ring with a lantern-cream selection halo while a chase camera follows it
into review; the whole flotilla freezes mid-review so nothing distracts;
Today/Global cameras land dead-center; all small boats one uniform size.
A 53 s golden-path demo video was recorded (`Background/enjoy-demo-2026-09-20.mp4`,
local-only). Pitch deck + 2-min script live in `docs/presentation/`.
See `docs/sessions/` for the full log.
