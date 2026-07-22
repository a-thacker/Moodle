"""per-user UI preferences

Revision ID: 0015_user_preferences
Revises: 0014_rip_jobs
Create Date: 2026-07-21

Adds `users.preferences` — a JSON blob of per-account UI settings (sidebar tool
order/visibility, dashboard tile arrangement, weather location) so a user's
layout follows them onto any machine they sign in on instead of living only in
that browser's localStorage. Idempotent: skips the column if it already exists.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0015_user_preferences"
down_revision: str | None = "0014_rip_jobs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _has_column(bind, table: str, column: str) -> bool:
    insp = sa.inspect(bind)
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    if not _has_column(bind, "users", "preferences"):
        op.add_column(
            "users",
            sa.Column(
                "preferences",
                sa.JSON(),
                nullable=False,
                server_default="{}",
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if _has_column(bind, "users", "preferences"):
        op.drop_column("users", "preferences")
