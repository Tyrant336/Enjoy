"""Event outbox writer — THE ONE way backend code emits WorldEvents (§5.3).

Rules enforced here:
- **Same-transaction rule (§5.3):** callers emit inside the SAME session/
  transaction as the mutation the events belong to, so the journal can never
  lag behind the visual. This module never commits — the caller owns the txn.
- **Per-user monotonic seq:** the caller's transaction takes a row lock on
  the user's `users` row (FOR UPDATE) — the per-user mutex — before reading
  max(seq), so two concurrent mutations can never interleave or collide on
  seq. Gaps never happen within a committed txn; a rolled-back txn simply
  never emits (FE gap-detection tolerates it by refetching world-state).
- Every payload is the full WorldEvent JSON ({id, seq, type, …}) exactly per
  the §5.3 union — the FE parses `data:` frames into these verbatim.
"""

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models as m
from app import schemas as s

# NFR-1: camera transitions ≥1500 ms.
CAMERA_DURATION_MS = 2200


def _event_id() -> str:
    return f"evt-{uuid.uuid4().hex[:12]}"


async def _lock_user(session: AsyncSession, user_id: str) -> None:
    """Per-user seq mutex: lock the users row for the rest of this txn."""
    await session.execute(
        select(m.User.id).where(m.User.id == user_id).with_for_update()
    )


async def emit(
    session: AsyncSession, user_id: str, events: list[dict[str, Any]]
) -> list[int]:
    """Append WorldEvents to the outbox with ascending per-user seqs.

    `events` are payload dicts WITHOUT id/seq (both assigned here, in order).
    Returns the assigned seqs. Never commits — same-transaction rule.
    """
    if not events:
        return []
    await _lock_user(session, user_id)
    current = (
        await session.execute(
            select(m.EventOutbox.seq)
            .where(m.EventOutbox.user_id == user_id)
            .order_by(m.EventOutbox.seq.desc())
            .limit(1)
        )
    ).scalar_one_or_none() or 0
    seqs: list[int] = []
    for offset, payload in enumerate(events, start=1):
        seq = current + offset
        event_type = payload["type"]
        full = {"id": _event_id(), "seq": seq, **payload}
        session.add(
            m.EventOutbox(user_id=user_id, seq=seq, type=event_type, payload=full)
        )
        seqs.append(seq)
    return seqs


# ── §5.3 payload builders (exact union members, camelCase keys) ──────────────


def narrate(text: str) -> dict[str, Any]:
    return {"type": "narrate", "text": text}


def camera_fly_to(
    target: str, preset: s.CameraPreset, duration_ms: int = CAMERA_DURATION_MS
) -> dict[str, Any]:
    if duration_ms < 1500:
        raise ValueError("camera_fly_to durationMs must be ≥1500 (NFR-1)")
    return {
        "type": "camera_fly_to",
        "target": target,
        "preset": preset,
        "durationMs": duration_ms,
    }


def highlight(target: str) -> dict[str, Any]:
    return {"type": "highlight", "target": target}


def spawn_boat(deck: s.Deck) -> dict[str, Any]:
    return {"type": "spawn_boat", "deck": deck.model_dump(mode="json", by_alias=True)}


def enter_review_pov(deck_id: str) -> dict[str, Any]:
    return {"type": "enter_review_pov", "deckId": deck_id}


def show_card(deck_id: str, card: s.Flashcard) -> dict[str, Any]:
    return {
        "type": "show_card",
        "deckId": deck_id,
        "card": card.model_dump(mode="json", by_alias=True),
    }


def sink_boat() -> dict[str, Any]:
    return {"type": "sink_boat"}


def rise_boat(card: s.Flashcard) -> dict[str, Any]:
    return {"type": "rise_boat", "card": card.model_dump(mode="json", by_alias=True)}


def exit_review_pov() -> dict[str, Any]:
    return {"type": "exit_review_pov"}


def dock_at_lamp(deck_id: str) -> dict[str, Any]:
    return {"type": "dock_at_lamp", "deckId": deck_id}


def lamp_glow(level: float) -> dict[str, Any]:
    return {"type": "lamp_glow", "level": level}


def tour_offer(roadmap_id: str) -> dict[str, Any]:
    return {"type": "tour_offer", "roadmapId": roadmap_id}


def tour_start(roadmap: s.Roadmap) -> dict[str, Any]:
    return {
        "type": "tour_start",
        "roadmap": roadmap.model_dump(mode="json", by_alias=True),
    }


def tour_end() -> dict[str, Any]:
    return {"type": "tour_end"}


def error(message: str) -> dict[str, Any]:
    return {"type": "error", "message": message}
