"""TV-show fields on rip jobs

Revision ID: 0017_rip_tv_fields
Revises: 0016_vault_repos
Create Date: 2026-07-29

Adds show_name / season / start_episode / episode_count to rip_jobs so a job can
describe a TV disc (episodes named "<Show> - SxxEyy"). Null for movie rips.
Idempotent: each column is added only if missing.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0017_rip_tv_fields"
down_revision: str | None = "0016_vault_repos"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_COLUMNS = (
    ("show_name", sa.String(length=300)),
    ("season", sa.Integer()),
    ("start_episode", sa.Integer()),
    ("episode_count", sa.Integer()),
)


def _has_column(bind, table: str, column: str) -> bool:
    insp = sa.inspect(bind)
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    for name, coltype in _COLUMNS:
        if not _has_column(bind, "rip_jobs", name):
            op.add_column("rip_jobs", sa.Column(name, coltype, nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    for name, _ in reversed(_COLUMNS):
        if _has_column(bind, "rip_jobs", name):
            op.drop_column("rip_jobs", name)
