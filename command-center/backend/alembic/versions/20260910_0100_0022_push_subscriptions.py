"""web push subscriptions

Revision ID: 0022_push_subscriptions
Revises: 0021_task_alerts
Create Date: 2026-09-10

Adds `push_subscriptions` — one row per browser/device a user has granted
notification permission on, so the reminders loop can deliver the daily task
notifications to the Command Center PWA (Web Push / VAPID) instead of ntfy.
Other channels (proactive AI nudges, the owner broadcast) stay on ntfy.

Idempotent + portable: creating the table (and its index) is guarded on the
table's absence, so re-running after a successful upgrade is a no-op.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0022_push_subscriptions"
down_revision: str | None = "0021_task_alerts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _has_table(bind, name: str) -> bool:
    return sa.inspect(bind).has_table(name)


def upgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "push_subscriptions"):
        return

    op.create_table(
        "push_subscriptions",
        sa.Column(
            "id",
            sa.BigInteger().with_variant(sa.Integer, "sqlite"),
            primary_key=True,
            autoincrement=True,
        ),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("p256dh", sa.String(length=255), nullable=False),
        sa.Column("auth", sa.String(length=255), nullable=False),
        sa.Column("user_agent", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("endpoint", name="uq_push_subscriptions_endpoint"),
    )
    op.create_index(
        "ix_push_subscriptions_user_id", "push_subscriptions", ["user_id"]
    )


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, "push_subscriptions"):
        return
    op.drop_index("ix_push_subscriptions_user_id", table_name="push_subscriptions")
    op.drop_table("push_subscriptions")
