"""provider-agnostic calendar

Revision ID: 0018_calendar
Revises: 0017_rip_tv_fields
Create Date: 2026-07-31

Adds the per-user calendar layer:

- `calendar_sources` — a user's calendar feeds (kind="eclass" agent-fed, or
  kind="ics" a read-only Google/Apple feed URL) plus sync bookkeeping.
- `calendar_events` — imported event mirrors, keyed uniquely by
  (source_id, external_uid) so a re-sync upserts instead of duplicating.

Idempotent: each table is created only if missing.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0018_calendar"
down_revision: str | None = "0017_rip_tv_fields"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _has_table(bind, table: str) -> bool:
    return sa.inspect(bind).has_table(table)


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_table(bind, "calendar_sources"):
        op.create_table(
            "calendar_sources",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column(
                "user_id",
                sa.Uuid(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("kind", sa.String(length=20), nullable=False),
            sa.Column("label", sa.String(length=120), nullable=False),
            sa.Column("color", sa.String(length=20), nullable=True),
            sa.Column("url", sa.String(length=1000), nullable=True),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("last_synced_at", sa.DateTime(), nullable=True),
            sa.Column("last_sync_ok", sa.Boolean(), nullable=True),
            sa.Column("last_sync_error", sa.Text(), nullable=True),
            sa.Column("event_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index(
            "ix_calendar_sources_user_id", "calendar_sources", ["user_id"]
        )

    if not _has_table(bind, "calendar_events"):
        op.create_table(
            "calendar_events",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column(
                "user_id",
                sa.Uuid(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "source_id",
                sa.BigInteger(),
                sa.ForeignKey("calendar_sources.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("source", sa.String(length=20), nullable=False),
            sa.Column("external_uid", sa.String(length=500), nullable=False),
            sa.Column("title", sa.String(length=500), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("location", sa.String(length=500), nullable=True),
            sa.Column("url", sa.String(length=1000), nullable=True),
            sa.Column("start", sa.DateTime(), nullable=False),
            sa.Column("end", sa.DateTime(), nullable=True),
            sa.Column("all_day", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("course_name", sa.String(length=255), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint(
                "source_id", "external_uid", name="uq_calendar_events_source_uid"
            ),
        )
        op.create_index("ix_calendar_events_user_id", "calendar_events", ["user_id"])
        op.create_index("ix_calendar_events_source_id", "calendar_events", ["source_id"])
        op.create_index("ix_calendar_events_start", "calendar_events", ["start"])


def downgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "calendar_events"):
        op.drop_index("ix_calendar_events_start", table_name="calendar_events")
        op.drop_index("ix_calendar_events_source_id", table_name="calendar_events")
        op.drop_index("ix_calendar_events_user_id", table_name="calendar_events")
        op.drop_table("calendar_events")
    if _has_table(bind, "calendar_sources"):
        op.drop_index("ix_calendar_sources_user_id", table_name="calendar_sources")
        op.drop_table("calendar_sources")
