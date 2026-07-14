"""eclass data tables

Revision ID: 0003_eclass
Revises: 0002_grocery
Create Date: 2026-07-13

Hand-authored to match app.models.eclass (courses, grade_snapshots,
grade_events, timeline_events).
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0003_eclass"
down_revision: str | None = "0002_grocery"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "courses",
        sa.Column("id", sa.BigInteger(), autoincrement=False, nullable=False),
        sa.Column("short_name", sa.String(length=120), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("hidden", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "grade_snapshots",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("course_id", sa.BigInteger(), nullable=False),
        sa.Column("report", sa.JSON(), nullable=False),
        sa.Column("fetched_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_grade_snapshots_course_id", "grade_snapshots", ["course_id"])

    op.create_table(
        "grade_events",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("course_id", sa.BigInteger(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("item_name", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=255), nullable=True),
        sa.Column("old", sa.String(length=255), nullable=True),
        sa.Column("new", sa.String(length=255), nullable=True),
        sa.Column("is_total", sa.Boolean(), nullable=False),
        sa.Column("detected_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_grade_events_course_id", "grade_events", ["course_id"])
    op.create_index("ix_grade_events_detected_at", "grade_events", ["detected_at"])

    op.create_table(
        "timeline_events",
        sa.Column("id", sa.BigInteger(), autoincrement=False, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("due", sa.DateTime(), nullable=False),
        sa.Column("module", sa.String(length=40), nullable=True),
        sa.Column("course_id", sa.BigInteger(), nullable=True),
        sa.Column("course_name", sa.String(length=255), nullable=True),
        sa.Column("url", sa.String(length=512), nullable=True),
        sa.Column("overdue", sa.Boolean(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_timeline_events_due", "timeline_events", ["due"])


def downgrade() -> None:
    op.drop_table("timeline_events")
    op.drop_index("ix_grade_events_detected_at", table_name="grade_events")
    op.drop_index("ix_grade_events_course_id", table_name="grade_events")
    op.drop_table("grade_events")
    op.drop_index("ix_grade_snapshots_course_id", table_name="grade_snapshots")
    op.drop_table("grade_snapshots")
    op.drop_table("courses")
