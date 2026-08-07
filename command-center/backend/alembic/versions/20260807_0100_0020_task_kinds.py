"""task kinds + notification rework

Revision ID: 0020_task_kinds
Revises: 0019_projects
Create Date: 2026-08-07

Reworks tasks for the three-type notification model:

- adds `kind` (task|reminder), `source` (manual|eclass), `external_id`
  (provider id for dedup of synced assignments), and the new notification
  bookkeeping `notified_at_time` + `last_nudge_date`.
- drops the old one-shot `notified_before` / `notified_after` flags.

Idempotent + portable (batch mode: direct ALTER on Postgres, copy-and-move on
SQLite).
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0020_task_kinds"
down_revision: str | None = "0019_projects"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _cols(bind) -> set[str]:
    return {c["name"] for c in sa.inspect(bind).get_columns("tasks")}


def upgrade() -> None:
    bind = op.get_bind()
    cols = _cols(bind)
    with op.batch_alter_table("tasks", schema=None) as batch:
        if "kind" not in cols:
            batch.add_column(sa.Column("kind", sa.String(length=12), nullable=False, server_default="task"))
        if "source" not in cols:
            batch.add_column(sa.Column("source", sa.String(length=20), nullable=False, server_default="manual"))
        if "external_id" not in cols:
            batch.add_column(sa.Column("external_id", sa.String(length=64), nullable=True))
        if "notified_at_time" not in cols:
            batch.add_column(sa.Column("notified_at_time", sa.Boolean(), nullable=False, server_default=sa.false()))
        if "last_nudge_date" not in cols:
            batch.add_column(sa.Column("last_nudge_date", sa.Date(), nullable=True))
        if "notified_before" in cols:
            batch.drop_column("notified_before")
        if "notified_after" in cols:
            batch.drop_column("notified_after")

    idx = {i["name"] for i in sa.inspect(bind).get_indexes("tasks")}
    if "ix_tasks_external_id" not in idx:
        op.create_index("ix_tasks_external_id", "tasks", ["external_id"])


def downgrade() -> None:
    bind = op.get_bind()
    idx = {i["name"] for i in sa.inspect(bind).get_indexes("tasks")}
    if "ix_tasks_external_id" in idx:
        op.drop_index("ix_tasks_external_id", table_name="tasks")
    cols = _cols(bind)
    with op.batch_alter_table("tasks", schema=None) as batch:
        if "notified_before" not in cols:
            batch.add_column(sa.Column("notified_before", sa.Boolean(), nullable=False, server_default=sa.false()))
        if "notified_after" not in cols:
            batch.add_column(sa.Column("notified_after", sa.Boolean(), nullable=False, server_default=sa.false()))
        for c in ("last_nudge_date", "notified_at_time", "external_id", "source", "kind"):
            if c in cols:
                batch.drop_column(c)
