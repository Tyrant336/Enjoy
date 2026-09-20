"""Chat (FR-5.1, the single orchestrator entry) + tour actions (§5.2).

Tours are OFFERED, never forced (§1): the big-task chat path enqueues a
tour_offer; these endpoints are the user's answer — start ("Begin tour"),
dismiss ("Not now"), replay (the always-visible "?" button).
"""

import logging

from fastapi import APIRouter
from sqlalchemy import select

from app import models as m
from app import schemas as s
from app.agents.orchestrator.service import ChatRequest, ChatResponse, handle_chat
from app.api.deps import CurrentUser, SessionDep
from app.core import llm
from app.core.errors import AppError
from app.services import outbox

logger = logging.getLogger("enjoy.api.chat")

router = APIRouter()


class TourAck(s.ContractModel):
    roadmap_id: str


async def _user_roadmap(
    session: SessionDep, user: CurrentUser, roadmap_id: str
) -> s.Roadmap:
    row = (
        await session.execute(
            select(m.Roadmap).where(
                m.Roadmap.id == roadmap_id, m.Roadmap.user_id == user.id
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise AppError(
            404,
            "ROADMAP_NOT_FOUND",
            "That tour does not exist in your harbour.",
            detail={"roadmapId": roadmap_id},
        )
    if row.plan_id is None:
        raise AppError(
            500,
            "ROADMAP_MISSING",
            "That tour has no plan reference.",
            detail={"roadmapId": roadmap_id},
            recoverable=False,
        )
    return s.Roadmap(
        id=row.id,
        plan_id=row.plan_id,
        steps=[s.RoadmapStep.model_validate(st) for st in row.steps],
    )


@router.post("/api/chat")
async def post_chat(
    body: ChatRequest, session: SessionDep, user: CurrentUser
) -> ChatResponse:
    try:
        response = await handle_chat(session, user, body.message)
    except llm.LLMError as exc:
        # Agent failure during an active workflow (§5.2): SSE error event
        # (committed) PLUS the error envelope — never a canned plan (§3.4).
        logger.error("chat workflow failed: %s", exc)
        await outbox.emit(
            session,
            user.id,
            [outbox.error("The harbour's planners could not reach the LLM this "
                          "time. Nothing was lost — try again when ready.")],
        )
        await session.commit()
        raise AppError(
            502,
            "LLM_UNAVAILABLE",
            "The harbour could not reach the LLM right now.",
            detail={"reason": str(exc)[:500]},
            recoverable=True,
        ) from exc
    await session.commit()
    return response


@router.post("/api/tours/{roadmap_id}/start")
async def post_tour_start(
    roadmap_id: str, session: SessionDep, user: CurrentUser
) -> s.Roadmap:
    roadmap = await _user_roadmap(session, user, roadmap_id)
    await outbox.emit(session, user.id, [outbox.tour_start(roadmap)])
    await session.commit()
    return roadmap


@router.post("/api/tours/{roadmap_id}/replay")
async def post_tour_replay(
    roadmap_id: str, session: SessionDep, user: CurrentUser
) -> s.Roadmap:
    # The "?" button — replaying IS starting again (§5.2), one code path.
    roadmap = await _user_roadmap(session, user, roadmap_id)
    await outbox.emit(session, user.id, [outbox.tour_start(roadmap)])
    await session.commit()
    return roadmap


@router.post("/api/tours/{roadmap_id}/dismiss")
async def post_tour_dismiss(
    roadmap_id: str, session: SessionDep, user: CurrentUser
) -> TourAck:
    await _user_roadmap(session, user, roadmap_id)  # 404 envelope if unknown
    # tour_end clears any pending offer / ends an active tour (one event for
    # both — "Skip tour" uses this too; the FE treats it idempotently).
    await outbox.emit(session, user.id, [outbox.tour_end()])
    await session.commit()
    return TourAck(roadmap_id=roadmap_id)
