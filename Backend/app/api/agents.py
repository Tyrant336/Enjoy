"""Agent endpoints — scheduler (FR-1) + flashcards review (FR-2).

Every mutation commits its session ONCE at the end — the mutation and its
outbox events land in one transaction (§5.3). Read endpoints stay in
app/api/world.py's sibling services.
"""

from fastapi import APIRouter

from app import schemas as s
from app.agents.flashcards import review
from app.agents.scheduler.planner import PlanRequest
from app.agents.scheduler.service import TaskCompleteResponse, complete_task, create_plan
from app.api.deps import CurrentUser, SessionDep
from app.services import world_state

router = APIRouter()


@router.get("/agents/kg/graph")
async def get_kg_graph(session: SessionDep, user: CurrentUser) -> s.KnowledgeGraph:
    return await world_state.build_kg_graph(session, user)


@router.get("/agents/flashcards/today")
async def get_today_decks(session: SessionDep, user: CurrentUser) -> list[s.Deck]:
    return await world_state.list_today_decks(session, user)


# ── Scheduler (FR-1) ─────────────────────────────────────────────────────────


@router.post("/agents/scheduler/plan")
async def post_plan(
    body: PlanRequest, session: SessionDep, user: CurrentUser
) -> s.StudyPlan:
    plan = await create_plan(session, user, body)
    await session.commit()
    return plan


@router.post("/agents/scheduler/tasks/{task_id}/complete")
async def post_complete_task(
    task_id: str, session: SessionDep, user: CurrentUser
) -> TaskCompleteResponse:
    result = await complete_task(session, user, task_id)
    await session.commit()
    return result


# ── Flashcard review (FR-2.5/2.8/2.9) ────────────────────────────────────────


@router.post("/agents/flashcards/review/start")
async def post_review_start(
    body: review.StartRequest, session: SessionDep, user: CurrentUser
) -> review.ReviewStartResponse:
    result = await review.start_review(session, user, body.deck_id)
    await session.commit()
    return result


@router.post("/agents/flashcards/review/reveal")
async def post_review_reveal(
    body: review.RevealRequest, session: SessionDep, user: CurrentUser
) -> review.RevealResponse:
    return await review.reveal(session, user, body.card_id)


@router.post("/agents/flashcards/review/grade")
async def post_review_grade(
    body: review.GradeRequest, session: SessionDep, user: CurrentUser
) -> review.GradeResponse:
    result = await review.grade(session, user, body.card_id, body.rating)
    await session.commit()
    return result


@router.post("/agents/flashcards/review/exit")
async def post_review_exit(
    body: review.ExitRequest, session: SessionDep, user: CurrentUser
) -> review.ExitResponse:
    result = await review.exit_review(session, user, body.deck_id)
    await session.commit()
    return result
