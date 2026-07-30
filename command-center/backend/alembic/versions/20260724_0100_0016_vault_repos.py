"""obsidian vault registrations

Revision ID: 0016_vault_repos
Revises: 0015_user_preferences
Create Date: 2026-07-24

Adds `vault_repos` — the git-backed Obsidian vaults a user has connected to the
hub (name, git remote, branch, subpath, ai_readable flag, sync status). Note
bodies are never stored here; the backend reads them from the cloned repo on a
data volume. Idempotent: skips the table if it already exists.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0016_vault_repos"
down_revision: str | None = "0015_user_preferences"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _has_table(bind, table: str) -> bool:
    return sa.inspect(bind).has_table(table)


def upgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "vault_repos"):
        return
    op.create_table(
        "vault_repos",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("git_url", sa.String(length=500), nullable=False),
        sa.Column("branch", sa.String(length=120), nullable=False, server_default="main"),
        sa.Column("subpath", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("ai_readable", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("last_synced_at", sa.DateTime(), nullable=True),
        sa.Column("last_sync_ok", sa.Boolean(), nullable=True),
        sa.Column("last_sync_error", sa.Text(), nullable=True),
        sa.Column("note_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_vault_repos_user_id", "vault_repos", ["user_id"])


def downgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "vault_repos"):
        op.drop_index("ix_vault_repos_user_id", table_name="vault_repos")
        op.drop_table("vault_repos")
