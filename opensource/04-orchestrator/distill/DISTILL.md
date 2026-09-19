# DISTILL — 04-orchestrator → `Backend/` (+ WS contract for `frontend/`)

## Goal (REQUIREMENTS.md §FR-5)
One supervisor agent: text(/voice) in → routes to Scheduler / Flashcard / KG agents →
streams narration + world commands (camera, boats, nodes) to the Next.js frontend.
Every new big task = generated roadmap tour.

## What to extract (per repo)

### `fastapi-langgraph-template/` — BACKEND SKELETON (fork structure)
- Copy its project layout, FastAPI app factory, LangGraph agent wiring, and
  **streaming endpoint** pattern into `Backend/`:
  ```
  Backend/
    app/main.py            # FastAPI app + CORS
    app/agents/            # scheduler/ flashcards/ kg/ orchestrator/
    app/api/chat.py        # POST /chat (orchestrator entry)
    app/api/events.py      # GET /api/events — SSE stream from event_outbox
    app/core/config.py     # OPENROUTER_API_KEY, model names
  ```
- Ignore: its auth, its specific domain logic, Docker (keep it simple).

### `langgraph-supervisor/` (in 01 folder) + `langgraph-swarm/` — ROUTING BRAIN
- Use `create_supervisor` pattern: supervisor LLM with 3 handoff tools:
  `call_scheduler`, `call_flashcards`, `call_kg`.
- Target: `Backend/app/agents/orchestrator/graph.py`
- Add a 4th capability: `make_roadmap` — after agents finish, emit an ordered tour:
```python
class TourStep(BaseModel):
    target: str          # "fishboat" | "smallboat:{deck_id}" | "underwater" | "lamp"
    narration: str       # warm, ≤2 sentences
    camera_preset: str   # matches FE preset names
class Roadmap(BaseModel):
    steps: list[TourStep]   # order adapts to user input
```

### World-command protocol (Backend → Frontend, SSE JSON — see REQUIREMENTS §5.3)
Implement EXACTLY these message types (REQUIREMENTS.md §FR-5.4):
```json
{ "type": "narrate",        "text": "..." }
{ "type": "camera_fly_to",  "target": "fishboat", "duration_ms": 2000 }
{ "type": "highlight",      "target": "smallboat:thermo-1" }
{ "type": "spawn_boat",     "deck_id": "thermo-1", "label": "Thermo 1" }
{ "type": "enter_review_pov","deck_id": "thermo-1" }
{ "type": "show_card",      "card": { ...card JSON from 02/distill... } }
{ "type": "sink_boat" }                         // after grade
{ "type": "rise_boat",      "card": { ... } }   // next card appears
{ "type": "dock_at_lamp",   "deck_id": "thermo-1" }
{ "type": "spawn_node",     "node": { ...graph node from 03/distill... } }
{ "type": "tour_start",     "roadmap": { "steps": [...] } }
```
- Frontend side: `frontend/lib/worldBus.ts` — a Zustand store that consumes the SSE
  stream (seq-ordered, idempotent, gap→refetch world-state) and dispatches to scene
  actions (camera-controls `setLookAt`, boat spawns, etc.).

### `kokoro/` + `faster-whisper/` — VOICE (stretch, wire last)
- Kokoro: TTS for narration — serve behind `POST /voice/tts` (text → audio stream).
- faster-whisper: STT for voice input — `POST /voice/stt` (audio → text → /chat).
- Both are pip-installable; keep behind feature flag `VOICE_ENABLED=false` by default.
- ElevenLabs may replace Kokoro if the team has a key (same endpoint shape).

## Interface the scaffold MUST expose
(SUPERSEDED by REQUIREMENTS v2.1 §5.2 — that table is canonical. Summary:)
```
POST /api/chat      in: { "message": "I want to study thermodynamics" }
GET  /api/events    SSE stream: narration + WorldEvents (seq-ordered, per-user)
# client→server actions (grade, reveal, tour accept) go over REST — no WS
```

## Intent shortcuts (REQUIREMENTS.md §FR-0) — implement as cheap pre-router
- message contains "fishboat" only → call_scheduler directly
- "small boat" only → call_flashcards
- "underwater"/"atlas" → call_kg
- otherwise → full supervisor + roadmap tour

## Dependencies to add
`fastapi`, `uvicorn`, `sse-starlette`, `langgraph`, `langchain-openai`,
(`kokoro`, `faster-whisper` optional)

## DO NOT take
- Auth/users, Docker/K8s, Celery/Redis queues, LiveKit (unless voice becomes core),
  CopilotKit (our plain SSE protocol is simpler and already specified above).
