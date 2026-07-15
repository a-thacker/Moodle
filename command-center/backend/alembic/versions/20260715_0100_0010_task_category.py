"""task category tag

Revision ID: 0010_task_category
Revises: 0009_scripts
Create Date: 2026-07-15
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0010_task_category"
down_revision: str | None = "0009_scripts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("category", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("tasks", "category")
