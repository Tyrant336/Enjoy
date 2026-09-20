"""Agent endpoints — scheduler (FR-1), flashcards (FR-2), knowledge graph
(FR-3).

Every mutation commits its session ONCE at the end — the mutation and its
outbox events land in one transaction (§5.3). Read endpoints stay in
app/api/world.py's sibling services.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Form, UploadFile

from app import schemas as s
from app.agents.flashcards import review
from app.agents.flashcards.generate import generate_deck
from app.agents.kg.build import KGBuildResponse, build_graph
from app.agents.scheduler.planner import PlanRequest
from app.agents.scheduler.service import TaskCompleteResponse, complete_task, create_plan
from app.api.deps import CurrentUser, SessionDep
from app.core import llm
from app.core.errors import AppError
from app.services import outbox, world_state
from app.services.ingestion import ingest_document

logger = logging.getLogger("enjoy.api.agents")

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
    try:
        plan = await create_plan(session, user, body)
    except llm.LLMError as exc:
        logger.error("planning failed: %s", exc)
        raise AppError(
            502,
            "LLM_UNAVAILABLE",
            "The planner could not reach the LLM this time.",
            detail={"reason": str(exc)[:500]},
            recoverable=True,
        ) from exc
    await session.commit()
    return plan


@router.post("/agents/scheduler/tasks/{task_id}/complete")
async def post_complete_task(
    task_id: str, session: SessionDep, user: CurrentUser
) -> TaskCompleteResponse:
    result = await complete_task(session, user, task_id)
    await session.commit()
    return result


# ── Flashcard generation (FR-2.1/2.2/2.3, P1) ────────────────────────────────


@router.post("/agents/flashcards/generate")
async def post_generate_deck(
    session: SessionDep,
    user: CurrentUser,
    file: UploadFile,
    deck_name: Annotated[str, Form(min_length=1, max_length=200)],
) -> s.Deck:
    """Multipart file + deck_name → Deck (+cards persisted, §5.2).

    Agent failure during the workflow = REST error envelope PLUS an SSE
    `error` event (§5.2) — the event is committed before the envelope is
    raised so the world never pretends all is well (§2.5).
    """
    data = await file.read()
    document = await ingest_document(file.filename or "upload", data)
    try:
        deck = await generate_deck(
            session, user, deck_name=deck_name.strip(), document=document
        )
    except llm.LLMError as exc:
        logger.error("deck generation failed: %s", exc)
        await outbox.emit(
            session,
            user.id,
            [outbox.error("The card generator could not reach the LLM this time. "
                          "Nothing was lost — try again when you're ready.")],
        )
        await session.commit()
        raise AppError(
            502,
            "LLM_UNAVAILABLE",
            "The study-card generator is unavailable right now.",
            detail={"reason": str(exc)[:500]},
            recoverable=True,
        ) from exc
    await session.commit()
    return deck


# ── Knowledge graph build (FR-3.1/3.2/3.3, P1) ───────────────────────────────


@router.post("/agents/kg/build")
async def post_kg_build(
    session: SessionDep, user: CurrentUser, file: UploadFile
) -> KGBuildResponse:
    """Multipart file → merged graph delta (§5.2).

    The sanctioned KeyBERT fallback (FR-3.2) happens INSIDE the graph — an
    LLMError here means even that path failed: SSE `error` + envelope.
    """
    data = await file.read()
    document = await ingest_document(file.filename or "upload", data)
    try:
        result = await build_graph(session, user, document=document)
    except (llm.LLMError, AppError) as exc:
        logger.error("kg build failed: %s", exc)
        await outbox.emit(
            session,
            user.id,
            [outbox.error("The atlas could not absorb this document this time. "
                          "Nothing was lost — try again when you're ready.")],
        )
        await session.commit()
        if isinstance(exc, AppError):
            raise
        raise AppError(
            502,
            "LLM_UNAVAILABLE",
            "The knowledge-graph extractor is unavailable right now.",
            detail={"reason": str(exc)[:500]},
            recoverable=True,
        ) from exc
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
