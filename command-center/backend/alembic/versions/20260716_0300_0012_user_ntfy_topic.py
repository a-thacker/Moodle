"""per-user ntfy topic

Revision ID: 0012_user_ntfy_topic
Revises: 0011_user_entitlements
Create Date: 2026-07-16

Adds `users.ntfy_topic` so every account has its own private reminder channel
(the topic name is the password — a long random string). Backfill preserves the
two existing env-configured topics by matching the account email (OWNER_EMAIL ←
NTFY_TOPIC, SIBLING_EMAIL ← SIBLING_NTFY_TOPIC) so the phones already subscribed
keep working; every other user gets a freshly generated topic.
"""
from __future__ import annotations

import os
import secrets
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0012_user_ntfy_topic"
down_revision: str | None = "0011_user_entitlements"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _generate() -> str:
    return f"cc-{secrets.token_urlsafe(24)}"


def upgrade() -> None:
    op.add_column("users", sa.Column("ntfy_topic", sa.String(length=80), nullable=True))

    bind = op.get_bind()
    # Preserve the two known accounts' existing topics by email so their phones
    # stay subscribed; everyone else gets a fresh one.
    known = {
        (os.environ.get("OWNER_EMAIL") or "").lower(): os.environ.get("NTFY_TOPIC") or None,
        (os.environ.get("SIBLING_EMAIL") or "").lower(): os.environ.get("SIBLING_NTFY_TOPIC") or None,
    }
    known.pop("", None)
    update = sa.text("UPDATE users SET ntfy_topic = :topic WHERE id = :id")

    rows = bind.execute(sa.text("SELECT id, email FROM users")).fetchall()
    for user_id, email in rows:
        topic = known.get((email or "").lower()) or _generate()
        bind.execute(update, {"topic": topic, "id": user_id})


def downgrade() -> None:
    op.drop_column("users", "ntfy_topic")
