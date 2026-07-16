"""user entitlements + collapse legacy roles

Revision ID: 0011_user_entitlements
Revises: 0010_task_category
Create Date: 2026-07-16

Adds the per-user capability override table, then collapses the old
`sibling`/`roommate` roles into the generic `user` role — writing overrides that
preserve each account's existing access (roommate = grocery only; sibling =
their old tool set). Hand-authored to match app.models.entitlement.
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0011_user_entitlements"
down_revision: str | None = "0010_task_category"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# New-user defaults on: dashboard, planner, notes, assistant, settings(always).
# Overrides that reproduce each legacy role's old effective capabilities.
_LEGACY_OVERRIDES: dict[str, dict[str, bool]] = {
    "roommate": {
        "grocery": True,
        "dashboard": False,
        "planner": False,
        "notes": False,
        "assistant": False,
    },
    "sibling": {"grades": True, "notes": False},
}


def upgrade() -> None:
    op.create_table(
        "user_entitlements",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("capability", sa.String(length=64), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "capability", name="uq_user_entitlement"),
    )
    op.create_index(
        "ix_user_entitlements_user_id", "user_entitlements", ["user_id"]
    )

    # Collapse legacy roles → generic `user`, preserving their old access.
    bind = op.get_bind()
    insert = sa.text(
        "INSERT INTO user_entitlements (id, user_id, capability, enabled) "
        "VALUES (:id, :user_id, :capability, :enabled)"
    )
    rows = bind.execute(
        sa.text("SELECT id, role FROM users WHERE role IN ('roommate', 'sibling')")
    ).fetchall()
    for user_id, role in rows:
        for capability, enabled in _LEGACY_OVERRIDES.get(role, {}).items():
            bind.execute(
                insert,
                {
                    "id": uuid.uuid4(),
                    "user_id": user_id,
                    "capability": capability,
                    "enabled": enabled,
                },
            )
    bind.execute(
        sa.text("UPDATE users SET role = 'user' WHERE role IN ('roommate', 'sibling')")
    )


def downgrade() -> None:
    op.drop_index("ix_user_entitlements_user_id", table_name="user_entitlements")
    op.drop_table("user_entitlements")
