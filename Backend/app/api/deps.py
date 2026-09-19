"""Request-scoped dependencies — identity (REQUIREMENTS §4.4: no auth).

Every endpoint is scoped by the `X-Harbour-User-Id` header. A first-seen id
upserts a `users` row; a valid `X-Harbour-Timezone` header is persisted onto
it. Missing id or an invalid timezone = §5.2 error envelope (never silent).
"""

from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models as m
from app.core.db import get_session
from app.core.errors import AppError

SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def get_current_user(
    session: SessionDep,
    x_harbour_user_id: Annotated[str | None, Header()] = None,
    x_harbour_timezone: Annotated[str | None, Header()] = None,
) -> m.User:
    if not x_harbour_user_id or not x_harbour_user_id.strip():
        raise AppError(
            400,
            "MISSING_USER_ID",
            "The X-Harbour-User-Id header is required on every request.",
            recoverable=True,
        )
    user_id = x_harbour_user_id.strip()

    if x_harbour_timezone is not None:
        try:
            ZoneInfo(x_harbour_timezone)
        except ZoneInfoNotFoundError:
            raise AppError(
                400,
                "INVALID_TIMEZONE",
                "X-Harbour-Timezone must be an IANA timezone name.",
                detail={"timezone": x_harbour_timezone},
                recoverable=True,
            ) from None

    user = (
        await session.execute(select(m.User).where(m.User.id == user_id))
    ).scalar_one_or_none()
    if user is None:
        user = m.User(
            id=user_id,
            timezone=x_harbour_timezone or "UTC",
            prefs={},
        )
        session.add(user)
        await session.commit()
    elif x_harbour_timezone is not None and user.timezone != x_harbour_timezone:
        user.timezone = x_harbour_timezone
        await session.commit()
    return user


CurrentUser = Annotated[m.User, Depends(get_current_user)]
