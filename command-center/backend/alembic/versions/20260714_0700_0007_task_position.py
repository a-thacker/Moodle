"""task position (manual ordering)

Revision ID: 0007_task_position
Revises: 0006_usage
Create Date: 2026-07-14
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0007_task_position"
down_revision: str | None = "0006_usage"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column("position", sa.Float(), server_default="0", nullable=False),
    )
    # Seed distinct positions from id so existing tasks keep a stable order.
    op.execute("UPDATE tasks SET position = id")


def downgrade() -> None:
    op.drop_column("tasks", "position")
