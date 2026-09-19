"""SQLAlchemy ORM models — mirror migration 001 EXACTLY (all 11 §4.5 tables).

Verified against the live Postgres via `alembic check` (autogenerate diff must
be empty) and information_schema queries. Schema changes = new Alembic
migration first, then this file follows (AGENTS.md §5.6 — never the reverse).

JSONB columns are typed as `dict`/`list` here; every value crossing an API or
agent boundary is parsed into the frozen Pydantic contracts in
`app/schemas.py` first (AGENTS.md §2.4 — validation at the boundary).
"""

from datetime import date, datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

timestamptz = sa.DateTime(timezone=True)
# JSONB.__init__ is untyped in SQLAlchemy 2.0.x stubs — same narrow ignore
# as migration 001.
jsonb = postgresql.JSONB(astext_type=sa.Text())  # type: ignore[no-untyped-call]


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(sa.String(), primary_key=True)
    timezone: Mapped[str] = mapped_column(
        sa.String(), nullable=False, server_default="UTC"
    )
    prefs: Mapped[dict[str, Any]] = mapped_column(
        jsonb, nullable=False, server_default=sa.text("'{}'::jsonb")
    )
    created_at: Mapped[datetime] = mapped_column(
        timestamptz, nullable=False, server_default=sa.func.now()
    )


class StudyPlan(Base):
    __tablename__ = "study_plans"
    __table_args__ = (sa.Index("ix_study_plans_user_id", "user_id"),)

    id: Mapped[str] = mapped_column(sa.String(), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        sa.String(), sa.ForeignKey("users.id"), nullable=False
    )
    goal: Mapped[str] = mapped_column(sa.String(), nullable=False)
    empathy_line: Mapped[str] = mapped_column(sa.String(), nullable=False)
    granularity: Mapped[int] = mapped_column(
        sa.SmallInteger(), nullable=False, server_default="3"
    )
    created_at: Mapped[datetime] = mapped_column(
        timestamptz, nullable=False, server_default=sa.func.now()
    )


class StudyTask(Base):
    __tablename__ = "study_tasks"
    __table_args__ = (
        sa.Index("ix_study_tasks_plan_id", "plan_id"),
        sa.Index("ix_study_tasks_user_id", "user_id"),
    )

    id: Mapped[str] = mapped_column(sa.String(), primary_key=True)
    plan_id: Mapped[str] = mapped_column(
        sa.String(), sa.ForeignKey("study_plans.id"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(
        sa.String(), sa.ForeignKey("users.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(sa.String(), nullable=False)
    description: Mapped[str] = mapped_column(
        sa.Text(), nullable=False, server_default=""
    )
    estimate_minutes: Mapped[int] = mapped_column(sa.SmallInteger(), nullable=False)
    difficulty: Mapped[int] = mapped_column(
        sa.SmallInteger(), nullable=False, server_default="3"
    )
    status: Mapped[str] = mapped_column(
        sa.String(), nullable=False, server_default="todo"
    )
    scheduled_for: Mapped[date | None] = mapped_column(sa.Date(), nullable=True)
    slot: Mapped[str | None] = mapped_column(sa.String(), nullable=True)
    depends_on: Mapped[list[Any]] = mapped_column(
        jsonb, nullable=False, server_default=sa.text("'[]'::jsonb")
    )
    deck_request: Mapped[dict[str, Any] | None] = mapped_column(jsonb, nullable=True)
    world_label: Mapped[str | None] = mapped_column(sa.String(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        timestamptz, nullable=False, server_default=sa.func.now()
    )


class Deck(Base):
    __tablename__ = "decks"
    __table_args__ = (sa.Index("ix_decks_user_id", "user_id"),)

    id: Mapped[str] = mapped_column(sa.String(), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        sa.String(), sa.ForeignKey("users.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(sa.String(), nullable=False)
    boat_state: Mapped[str] = mapped_column(
        sa.String(), nullable=False, server_default="docked"
    )
    apkg_url: Mapped[str | None] = mapped_column(sa.String(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        timestamptz, nullable=False, server_default=sa.func.now()
    )


class Flashcard(Base):
    __tablename__ = "flashcards"
    __table_args__ = (
        sa.Index("ix_flashcards_deck_id", "deck_id"),
        sa.Index("ix_flashcards_user_id", "user_id"),
    )

    id: Mapped[str] = mapped_column(sa.String(), primary_key=True)
    deck_id: Mapped[str] = mapped_column(
        sa.String(), sa.ForeignKey("decks.id"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(
        sa.String(), sa.ForeignKey("users.id"), nullable=False
    )
    question: Mapped[str] = mapped_column(sa.Text(), nullable=False)
    answer: Mapped[str] = mapped_column(sa.Text(), nullable=False)
    due: Mapped[datetime] = mapped_column(timestamptz, nullable=False)
    # FSRS state per-card (FR-2.8): parsed into schemas.FsrsState at boundaries.
    fsrs: Mapped[dict[str, Any]] = mapped_column(jsonb, nullable=False)
    # Per-card source snippet, ≤200 chars (§4.5 retention).
    source_snippet: Mapped[str | None] = mapped_column(
        sa.String(length=200), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        timestamptz, nullable=False, server_default=sa.func.now()
    )


class ReviewEvent(Base):
    """Append-only grade log (§4.5) — never updated or deleted."""

    __tablename__ = "review_events"
    __table_args__ = (
        sa.Index("ix_review_events_user_id", "user_id"),
        sa.Index("ix_review_events_card_id", "card_id"),
    )

    id: Mapped[int] = mapped_column(sa.BigInteger(), sa.Identity(), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        sa.String(), sa.ForeignKey("users.id"), nullable=False
    )
    card_id: Mapped[str] = mapped_column(
        sa.String(), sa.ForeignKey("flashcards.id"), nullable=False
    )
    deck_id: Mapped[str] = mapped_column(
        sa.String(), sa.ForeignKey("decks.id"), nullable=False
    )
    rating: Mapped[str] = mapped_column(sa.String(), nullable=False)
    graded_at: Mapped[datetime] = mapped_column(
        timestamptz, nullable=False, server_default=sa.func.now()
    )


class Record(Base):
    __tablename__ = "records"
    __table_args__ = (sa.Index("ix_records_user_id", "user_id"),)

    id: Mapped[str] = mapped_column(sa.String(), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        sa.String(), sa.ForeignKey("users.id"), nullable=False
    )
    kind: Mapped[str] = mapped_column(sa.String(), nullable=False)
    ref_id: Mapped[str] = mapped_column(sa.String(), nullable=False)
    title: Mapped[str] = mapped_column(sa.String(), nullable=False)
    at: Mapped[datetime] = mapped_column(
        timestamptz, nullable=False, server_default=sa.func.now()
    )


class Roadmap(Base):
    __tablename__ = "roadmaps"
    __table_args__ = (sa.Index("ix_roadmaps_user_id", "user_id"),)

    id: Mapped[str] = mapped_column(sa.String(), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        sa.String(), sa.ForeignKey("users.id"), nullable=False
    )
    plan_id: Mapped[str | None] = mapped_column(
        sa.String(), sa.ForeignKey("study_plans.id"), nullable=True
    )
    steps: Mapped[list[Any]] = mapped_column(jsonb, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        timestamptz, nullable=False, server_default=sa.func.now()
    )


class KGNode(Base):
    __tablename__ = "kg_nodes"
    __table_args__ = (
        sa.UniqueConstraint("user_id", "label", name="uq_kg_nodes_user_label"),
        sa.Index("ix_kg_nodes_user_id", "user_id"),
    )

    id: Mapped[str] = mapped_column(sa.String(), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        sa.String(), sa.ForeignKey("users.id"), nullable=False
    )
    # Normalized label enables merge/dedupe (FR-3.3).
    label: Mapped[str] = mapped_column(sa.String(), nullable=False)
    cluster_id: Mapped[str | None] = mapped_column(sa.String(), nullable=True)
    # Remaining canonical KGNode fields (type, gloss, deckIds, taskIds) live here;
    # parsed into schemas.KGNode at the boundary.
    data: Mapped[dict[str, Any]] = mapped_column(jsonb, nullable=False)


class KGEdge(Base):
    __tablename__ = "kg_edges"
    __table_args__ = (sa.Index("ix_kg_edges_user_id", "user_id"),)

    id: Mapped[int] = mapped_column(sa.BigInteger(), sa.Identity(), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        sa.String(), sa.ForeignKey("users.id"), nullable=False
    )
    source: Mapped[str] = mapped_column(sa.String(), nullable=False)
    target: Mapped[str] = mapped_column(sa.String(), nullable=False)
    type: Mapped[str] = mapped_column(sa.String(), nullable=False)
    data: Mapped[dict[str, Any]] = mapped_column(
        jsonb, nullable=False, server_default=sa.text("'{}'::jsonb")
    )


class EventOutbox(Base):
    """Per-user monotonic seq powers SSE ordering/gap detection (§5.3)."""

    __tablename__ = "event_outbox"
    __table_args__ = (
        sa.UniqueConstraint("user_id", "seq", name="uq_event_outbox_user_seq"),
        sa.Index("ix_event_outbox_user_id", "user_id"),
    )

    id: Mapped[int] = mapped_column(sa.BigInteger(), sa.Identity(), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        sa.String(), sa.ForeignKey("users.id"), nullable=False
    )
    seq: Mapped[int] = mapped_column(sa.BigInteger(), nullable=False)
    type: Mapped[str] = mapped_column(sa.String(), nullable=False)
    # Full WorldEvent JSON (§5.3), incl. its own `id` and `seq` fields.
    payload: Mapped[dict[str, Any]] = mapped_column(jsonb, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        timestamptz, nullable=False, server_default=sa.func.now()
    )
