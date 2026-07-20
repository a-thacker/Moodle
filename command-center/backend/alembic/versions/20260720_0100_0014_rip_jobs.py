"""dvd ripper jobs

Revision ID: 0014_rip_jobs
Revises: 0013_proactive_log
Create Date: 2026-07-20

Queue table for the self-serve DVD ripper: the browser enqueues a job, the host
rip runner claims it and streams progress/result back. Hand-authored to match
app.models.rip.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0014_rip_jobs"
down_revision: str | None = "0013_proactive_log"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "rip_jobs",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("media_type", sa.String(length=20), nullable=False),
        sa.Column("extras", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("progress", sa.Text(), nullable=True),
        sa.Column("exit_code", sa.Integer(), nullable=True),
        sa.Column("requested_by", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["requested_by"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_rip_jobs_status", "rip_jobs", ["status"])
    op.create_index("ix_rip_jobs_created_at", "rip_jobs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_rip_jobs_created_at", table_name="rip_jobs")
    op.drop_index("ix_rip_jobs_status", table_name="rip_jobs")
    op.drop_table("rip_jobs")
