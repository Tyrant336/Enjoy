"""Harbour API — initial state, journal, and the SSE event stream.

- GET /api/world-state — canonical WorldState (§5.2); the FE rebuilds from it.
- GET /api/records     — journal timeline (FR-4.3).
- PUT /api/preferences — §5.2 user prefs (timezone, reducedMotion, labelsVisible).
- GET /api/events      — SSE (locked transport, §4.2): replays event_outbox in
  per-user seq order, then stays open (poll for new rows + heartbeat).
"""

import asyncio
import json
import time
from collections.abc import AsyncIterator
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Request
from sqlalchemy import select
from sse_starlette.sse import EventSourceResponse

from app import models as m
from app import schemas as s
from app.api.deps import CurrentUser, SessionDep
from app.core.db import get_session_factory
from app.core.errors import AppError
from app.services import world_state

router = APIRouter()

# SSE stream tuning (Phase 1 stub): poll the outbox, heartbeat to keep alive.
_SSE_POLL_SECONDS = 2.0
_SSE_HEARTBEAT_SECONDS = 15.0


@router.get("/api/world-state")
async def get_world_state(session: SessionDep, user: CurrentUser) -> s.WorldState:
    return await world_state.build_world_state(session, user)


@router.get("/api/records")
async def get_records(session: SessionDep, user: CurrentUser) -> list[s.Record]:
    return await world_state.list_records(session, user)


class PreferencesUpdate(s.ContractModel):
    """PUT /api/preferences body (§5.2): all fields optional; only provided
    fields are applied. Serializes as camelCase like every contract."""

    timezone: str | None = None
    reduced_motion: bool | None = None
    labels_visible: bool | None = None


@router.put("/api/preferences")
async def put_preferences(
    body: PreferencesUpdate, session: SessionDep, user: CurrentUser
) -> s.WorldUser:
    """Persist user prefs (§5.2): timezone onto users.timezone (IANA-validated,
    same rule as deps.py), reducedMotion/labelsVisible into users.prefs JSONB.
    Returns the updated prefs (canonical WorldUser shape)."""
    if body.timezone is not None:
        try:
            ZoneInfo(body.timezone)
        except ZoneInfoNotFoundError:
            raise AppError(
                400,
                "INVALID_TIMEZONE",
                "timezone must be an IANA timezone name.",
                detail={"timezone": body.timezone},
                recoverable=True,
            ) from None
        user.timezone = body.timezone
    prefs = dict(user.prefs)
    if body.reduced_motion is not None:
        prefs["reducedMotion"] = body.reduced_motion
    if body.labels_visible is not None:
        prefs["labelsVisible"] = body.labels_visible
    user.prefs = prefs
    session.add(user)
    await session.commit()
    return world_state.world_user_schema(user)


@router.get("/api/events")
async def get_events(request: Request, user: CurrentUser) -> EventSourceResponse:
    """Replay the outbox in seq order, then stream new events + heartbeats.

    Per-user monotonic seq (§5.3): FE processes in order, ignores duplicates,
    and on a gap/reconnect refetches /api/world-state. Short per-poll sessions
    via the ONE session factory — no long-held request session on the stream.
    """
    user_id = user.id

    async def stream() -> AsyncIterator[dict[str, str]]:
        last_seq = 0
        last_heartbeat = time.monotonic()
        while True:
            async with get_session_factory()() as session:
                rows = (
                    (
                        await session.execute(
                            select(m.EventOutbox)
                            .where(
                                m.EventOutbox.user_id == user_id,
                                m.EventOutbox.seq > last_seq,
                            )
                            .order_by(m.EventOutbox.seq)
                        )
                    )
                    .scalars()
                    .all()
                )
            for row in rows:
                last_seq = row.seq
                yield {
                    "id": str(row.seq),
                    "event": row.type,
                    "data": json.dumps(row.payload, ensure_ascii=False),
                }
            if await request.is_disconnected():
                return
            if time.monotonic() - last_heartbeat >= _SSE_HEARTBEAT_SECONDS:
                last_heartbeat = time.monotonic()
                yield {"comment": "heartbeat"}
            await asyncio.sleep(_SSE_POLL_SECONDS)

    return EventSourceResponse(stream())
