"""task due_time + notification flags

Revision ID: 0008_task_time
Revises: 0007_task_position
Create Date: 2026-07-14
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0008_task_time"
down_revision: str | None = "0007_task_position"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("due_time", sa.Time(), nullable=True))
    op.add_column("tasks", sa.Column("notified_before", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column("tasks", sa.Column("notified_after", sa.Boolean(), server_default=sa.false(), nullable=False))


def downgrade() -> None:
    op.drop_column("tasks", "notified_after")
    op.drop_column("tasks", "notified_before")
    op.drop_column("tasks", "due_time")
