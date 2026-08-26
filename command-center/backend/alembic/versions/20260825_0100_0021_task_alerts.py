"""task alerts + notification-fatigue rework

Revision ID: 0021_task_alerts
Revises: 0020_task_kinds
Create Date: 2026-08-25

Flips tasks from "every open task nags forever" to silent-by-default:

- adds `alert` (opt-in notification), `alert_time` (fire once at this time;
  NULL = ride the digest + midday/evening re-pings), and `important` (⭐, the
  only thing that resurfaces once overdue).
- migrates legacy `kind='reminder'` rows into `alert=true` (alert_time = due_time).
- clears the old eClass calendar-event pollution: deletes *undone* eclass-source
  tasks. Done items are kept (history); open assignments repopulate cleanly on
  the next agent sync, now that the agent pushes assignments only.
- drops the retired `kind` and `last_nudge_date` columns.
- adds `users.slot_at` — gates the morning-digest / midday / evening slots to one
  send per slot per day.

Idempotent + portable: every add/drop is guarded by a column check, and the
one-time data migration is gated on the legacy `kind` column still existing, so
re-running after a successful upgrade is a no-op.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0021_task_alerts"
down_revision: str | None = "0020_task_kinds"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _cols(bind, table: str) -> set[str]:
    return {c["name"] for c in sa.inspect(bind).get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"
    true_lit = "true" if is_pg else "1"
    false_lit = "false" if is_pg else "0"

    cols = _cols(bind, "tasks")
    with op.batch_alter_table("tasks", schema=None) as batch:
        if "alert" not in cols:
            batch.add_column(sa.Column("alert", sa.Boolean(), nullable=False, server_default=sa.false()))
        if "alert_time" not in cols:
            batch.add_column(sa.Column("alert_time", sa.Time(), nullable=True))
        if "important" not in cols:
            batch.add_column(sa.Column("important", sa.Boolean(), nullable=False, server_default=sa.false()))

    # One-time data migration, gated on the legacy `kind` column still existing.
    if "kind" in _cols(bind, "tasks"):
        # A manual "reminder" becomes an alert that fires at its old due_time.
        op.execute(f"UPDATE tasks SET alert = {true_lit}, alert_time = due_time WHERE kind = 'reminder'")
        # Drop the old eClass timeline pollution (non-assignment calendar events
        # were all ingested as tasks). Keep done items; open assignments come
        # back on the next sync now that the agent pushes assignments only.
        op.execute(f"DELETE FROM tasks WHERE source = 'eclass' AND done = {false_lit}")

    cols = _cols(bind, "tasks")
    with op.batch_alter_table("tasks", schema=None) as batch:
        if "kind" in cols:
            batch.drop_column("kind")
        if "last_nudge_date" in cols:
            batch.drop_column("last_nudge_date")

    if "slot_at" not in _cols(bind, "users"):
        with op.batch_alter_table("users", schema=None) as batch:
            batch.add_column(sa.Column("slot_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()

    if "slot_at" in _cols(bind, "users"):
        with op.batch_alter_table("users", schema=None) as batch:
            batch.drop_column("slot_at")

    cols = _cols(bind, "tasks")
    with op.batch_alter_table("tasks", schema=None) as batch:
        if "kind" not in cols:
            batch.add_column(sa.Column("kind", sa.String(length=12), nullable=False, server_default="task"))
        if "last_nudge_date" not in cols:
            batch.add_column(sa.Column("last_nudge_date", sa.Date(), nullable=True))
        for c in ("important", "alert_time", "alert"):
            if c in cols:
                batch.drop_column(c)
