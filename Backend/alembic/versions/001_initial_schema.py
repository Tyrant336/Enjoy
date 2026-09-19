"""001_initial_schema — all v1 persistence entities (REQUIREMENTS §4.5).

Revision ID: 001
Revises:
Create Date: 2026-09-19

Tables: users, study_plans, study_tasks, decks, flashcards, review_events,
records, roadmaps, kg_nodes (JSONB), kg_edges (JSONB), event_outbox
(per-user monotonic seq, powers SSE §5.3).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

timestamptz = sa.DateTime(timezone=True)
# JSONB.__init__ is untyped in SQLAlchemy 2.0.x stubs — narrow ignore.
jsonb = postgresql.JSONB(astext_type=sa.Text())  # type: ignore[no-untyped-call]


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("timezone", sa.String(), nullable=False, server_default="UTC"),
        sa.Column("prefs", jsonb, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", timestamptz, nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "study_plans",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("goal", sa.String(), nullable=False),
        sa.Column("empathy_line", sa.String(), nullable=False),
        sa.Column("granularity", sa.SmallInteger(), nullable=False, server_default="3"),
        sa.Column("created_at", timestamptz, nullable=False, server_default=sa.func.now()),
        sa.Index("ix_study_plans_user_id", "user_id"),
    )

    op.create_table(
        "study_tasks",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "plan_id", sa.String(), sa.ForeignKey("study_plans.id"), nullable=False
        ),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("estimate_minutes", sa.SmallInteger(), nullable=False),
        sa.Column("difficulty", sa.SmallInteger(), nullable=False, server_default="3"),
        sa.Column("status", sa.String(), nullable=False, server_default="todo"),
        sa.Column("scheduled_for", sa.Date(), nullable=True),
        sa.Column("slot", sa.String(), nullable=True),
        sa.Column(
            "depends_on", jsonb, nullable=False, server_default=sa.text("'[]'::jsonb")
        ),
        sa.Column("deck_request", jsonb, nullable=True),
        sa.Column("world_label", sa.String(), nullable=True),
        sa.Column("created_at", timestamptz, nullable=False, server_default=sa.func.now()),
        sa.Index("ix_study_tasks_plan_id", "plan_id"),
        sa.Index("ix_study_tasks_user_id", "user_id"),
    )

    op.create_table(
        "decks",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("boat_state", sa.String(), nullable=False, server_default="docked"),
        sa.Column("apkg_url", sa.String(), nullable=True),
        sa.Column("created_at", timestamptz, nullable=False, server_default=sa.func.now()),
        sa.Index("ix_decks_user_id", "user_id"),
    )

    op.create_table(
        "flashcards",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("deck_id", sa.String(), sa.ForeignKey("decks.id"), nullable=False),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("due", timestamptz, nullable=False),
        # FSRS state per-card (FR-2.8): {state, stability, difficulty, intervalDays, reps}
        sa.Column("fsrs", jsonb, nullable=False),
        # Per-card source snippet, ≤200 chars (§4.5 retention) — full text never stored.
        sa.Column("source_snippet", sa.String(length=200), nullable=True),
        sa.Column("created_at", timestamptz, nullable=False, server_default=sa.func.now()),
        sa.Index("ix_flashcards_deck_id", "deck_id"),
        sa.Index("ix_flashcards_user_id", "user_id"),
    )

    # Append-only grade log (§4.5) — never updated or deleted.
    op.create_table(
        "review_events",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "card_id", sa.String(), sa.ForeignKey("flashcards.id"), nullable=False
        ),
        sa.Column("deck_id", sa.String(), sa.ForeignKey("decks.id"), nullable=False),
        sa.Column("rating", sa.String(), nullable=False),  # again|hard|good|easy
        sa.Column("graded_at", timestamptz, nullable=False, server_default=sa.func.now()),
        sa.Index("ix_review_events_user_id", "user_id"),
        sa.Index("ix_review_events_card_id", "card_id"),
    )

    op.create_table(
        "records",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),  # deck_completed|task_done
        sa.Column("ref_id", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("at", timestamptz, nullable=False, server_default=sa.func.now()),
        sa.Index("ix_records_user_id", "user_id"),
    )

    op.create_table(
        "roadmaps",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "plan_id", sa.String(), sa.ForeignKey("study_plans.id"), nullable=True
        ),
        sa.Column("steps", jsonb, nullable=False),
        sa.Column("created_at", timestamptz, nullable=False, server_default=sa.func.now()),
        sa.Index("ix_roadmaps_user_id", "user_id"),
    )

    # Knowledge graph persisted as JSONB tables (AGENTS.md §5 overrides v1 JSON files).
    op.create_table(
        "kg_nodes",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        # Normalized label enables merge/dedupe (FR-3.3).
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("cluster_id", sa.String(), nullable=True),
        sa.Column("data", jsonb, nullable=False),
        sa.UniqueConstraint("user_id", "label", name="uq_kg_nodes_user_label"),
        sa.Index("ix_kg_nodes_user_id", "user_id"),
    )

    op.create_table(
        "kg_edges",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("target", sa.String(), nullable=False),
        sa.Column(
            "type", sa.String(), nullable=False
        ),  # EXPLAINS|PART_OF|REQUIRES|CONTRASTS_WITH|EXAMPLE_OF
        sa.Column("data", jsonb, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Index("ix_kg_edges_user_id", "user_id"),
    )

    # Per-user monotonic seq powers SSE ordering/gap detection (§5.3).
    op.create_table(
        "event_outbox",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("seq", sa.BigInteger(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("payload", jsonb, nullable=False),
        sa.Column("created_at", timestamptz, nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "seq", name="uq_event_outbox_user_seq"),
        sa.Index("ix_event_outbox_user_id", "user_id"),
    )


def downgrade() -> None:
    op.drop_table("event_outbox")
    op.drop_table("kg_edges")
    op.drop_table("kg_nodes")
    op.drop_table("roadmaps")
    op.drop_table("records")
    op.drop_table("review_events")
    op.drop_table("flashcards")
    op.drop_table("decks")
    op.drop_table("study_tasks")
    op.drop_table("study_plans")
    op.drop_table("users")
