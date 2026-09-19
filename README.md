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
| `opensource/` | Vetted open-source building blocks + `distill/` integration specs |

## Setup

```bash
cp .env.example .env   # then paste your OpenRouter key into .env
```

## Current state

Project scaffolding stage — see `docs/sessions/` for the latest session log.
