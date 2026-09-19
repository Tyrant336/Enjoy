"""Agent read endpoints (Phase 1: seeded-data reads only).

- GET /agents/kg/graph         — canonical KnowledgeGraph (§5.1, FR-3.3).
- GET /agents/flashcards/today — decks with dueToday > 0 (drives the circle,
  FR-2.4). Mutations (generate/reveal/grade/exit, kg/build) are Phase 2.
"""

from fastapi import APIRouter

from app import schemas as s
from app.api.deps import CurrentUser, SessionDep
from app.services import world_state

router = APIRouter()


@router.get("/agents/kg/graph")
async def get_kg_graph(session: SessionDep, user: CurrentUser) -> s.KnowledgeGraph:
    return await world_state.build_kg_graph(session, user)


@router.get("/agents/flashcards/today")
async def get_today_decks(session: SessionDep, user: CurrentUser) -> list[s.Deck]:
    return await world_state.list_today_decks(session, user)
