"""projects module

Revision ID: 0019_projects
Revises: 0018_calendar
Create Date: 2026-08-04

Adds the Projects module:

- `projects` — a per-user named goal (name, description, color, status,
  position) that groups tasks.
- `tasks.project_id` — optional FK to a project (ON DELETE SET NULL, so
  deleting a project leaves its tasks as loose/unfiled).

Idempotent: the table and column are each created only if missing.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0019_projects"
down_revision: str | None = "0018_calendar"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _has_table(bind, table: str) -> bool:
    return sa.inspect(bind).has_table(table)


def _has_column(bind, table: str, column: str) -> bool:
    return any(c["name"] == column for c in sa.inspect(bind).get_columns(table))


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_table(bind, "projects"):
        op.create_table(
            "projects",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column(
                "user_id",
                sa.Uuid(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("name", sa.String(length=200), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("color", sa.String(length=20), nullable=True),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
            sa.Column("position", sa.Float(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("done_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_projects_user_id", "projects", ["user_id"])

    if not _has_column(bind, "tasks", "project_id"):
        # Batch mode: a direct ALTER on Postgres, copy-and-move on SQLite (which
        # can't ALTER-add a constraint) — so the migration is portable.
        with op.batch_alter_table("tasks", schema=None) as batch:
            batch.add_column(sa.Column("project_id", sa.BigInteger(), nullable=True))
            batch.create_foreign_key(
                "fk_tasks_project_id", "projects", ["project_id"], ["id"], ondelete="SET NULL"
            )
        op.create_index("ix_tasks_project_id", "tasks", ["project_id"])


def downgrade() -> None:
    bind = op.get_bind()
    if _has_column(bind, "tasks", "project_id"):
        op.drop_index("ix_tasks_project_id", table_name="tasks")
        with op.batch_alter_table("tasks", schema=None) as batch:
            batch.drop_constraint("fk_tasks_project_id", type_="foreignkey")
            batch.drop_column("project_id")
    if _has_table(bind, "projects"):
        op.drop_index("ix_projects_user_id", table_name="projects")
        op.drop_table("projects")
