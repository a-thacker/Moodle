"""proactive notification log

Revision ID: 0013_proactive_log
Revises: 0012_user_ntfy_topic
Create Date: 2026-07-16

Records proactive AI notifications sent to each user, for rate-limiting +
de-duplication. Hand-authored to match app.models.proactive.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0013_proactive_log"
down_revision: str | None = "0012_user_ntfy_topic"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "proactive_log",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("content", sa.String(length=500), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_proactive_log_user_id", "proactive_log", ["user_id"])
    op.create_index("ix_proactive_log_content_hash", "proactive_log", ["content_hash"])


def downgrade() -> None:
    op.drop_index("ix_proactive_log_content_hash", table_name="proactive_log")
    op.drop_index("ix_proactive_log_user_id", table_name="proactive_log")
    op.drop_table("proactive_log")
