"""Scheduler Agent service — persistence around the template planner.

Agents talk to each other ONLY through the Orchestrator (AGENTS.md §4.3) —
this module is called by the scheduler API and by the orchestrator service,
never by another agent.
"""

import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models as m
from app import schemas as s
from app.agents.scheduler.planner import PlanRequest, build_plan
from app.core.errors import AppError
from app.services import outbox
from app.services.world_state import (
    LAMP_GLOW_PER_RECORD,
    record_schema,
    task_schema,
)


async def create_plan(
    session: AsyncSession, user: m.User, request: PlanRequest
) -> s.StudyPlan:
    """Build + persist a StudyPlan (the newest plan becomes the active one)."""
    today = datetime.now(ZoneInfo(user.timezone)).date()
    plan = build_plan(request, today)

    # FK flush tiers (session 013: UOW does not order by table-level FKs).
    session.add(
        m.StudyPlan(
            id=plan.id,
            user_id=user.id,
            goal=plan.goal,
            empathy_line=plan.empathy_line,
            granularity=plan.granularity,
        )
    )
    await session.flush()
    for t in plan.tasks:
        session.add(
            m.StudyTask(
                id=t.id,
                plan_id=plan.id,
                user_id=user.id,
                title=t.title,
                description=t.description,
                estimate_minutes=t.estimate_minutes,
                difficulty=t.difficulty,
                status=t.status,
                scheduled_for=t.scheduled_for,
                slot=t.slot,
                depends_on=t.depends_on,
                deck_request=(
                    None if t.deck_request is None
                    else t.deck_request.model_dump(by_alias=True)
                ),
                world_label=t.world_label,
            )
        )
    return plan


async def complete_task(
    session: AsyncSession, user: m.User, task_id: str
) -> "TaskCompleteResponse":
    """FR-1.6.3 "Done": task → done + journal Record + lamp glow, ONE txn
    with its outbox event (§5.3 — the journal never lags the visual).

    Idempotent: completing an already-done task returns the existing record
    instead of duplicating it (a double-click is not two victories).
    """
    task = (
        await session.execute(
            select(m.StudyTask).where(
                m.StudyTask.id == task_id, m.StudyTask.user_id == user.id
            )
        )
    ).scalar_one_or_none()
    if task is None:
        raise AppError(
            404,
            "TASK_NOT_FOUND",
            "That task does not exist in your harbour.",
            detail={"taskId": task_id},
        )

    record = (
        await session.execute(
            select(m.Record).where(
                m.Record.user_id == user.id,
                m.Record.kind == "task_done",
                m.Record.ref_id == task_id,
            )
        )
    ).scalar_one_or_none()
    if record is None:
        task.status = "done"
        record = m.Record(
            id=f"rec-{uuid.uuid4().hex[:12]}",
            user_id=user.id,
            kind="task_done",
            ref_id=task.id,
            title=task.title,
        )
        session.add(record)
        await session.flush()

    record_count = (
        await session.execute(
            select(func.count())
            .select_from(m.Record)
            .where(m.Record.user_id == user.id)
        )
    ).scalar_one()
    level = min(1.0, record_count * LAMP_GLOW_PER_RECORD)
    await outbox.emit(session, user.id, [outbox.lamp_glow(level)])

    return TaskCompleteResponse(task=task_schema(task), record=record_schema(record))


class TaskCompleteResponse(s.ContractModel):
    """POST /agents/scheduler/tasks/{taskId}/complete response (FR-1.6.3)."""

    task: s.StudyTask
    record: s.Record
