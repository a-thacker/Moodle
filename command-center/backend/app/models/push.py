"""Web Push subscription model.

One row per browser/device a user has granted notification permission on. The
installed PWA subscribes via the Push API and POSTs the resulting subscription
here; the reminders loop delivers the daily task notifications to every stored
subscription (pruning any the push service reports as gone). Distinct from
`users.ntfy_topic`, which still carries proactive nudges + the owner broadcast.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

_AutoBigInt = BigInteger().with_variant(Integer, "sqlite")


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(_AutoBigInt, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # The push service endpoint URL — the natural key we upsert / prune on. On
    # iOS this is a `web.push.apple.com` URL. Long enough to need TEXT.
    endpoint: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    # The subscription's encryption material (from PushSubscription.toJSON().keys).
    p256dh: Mapped[str] = mapped_column(String(255), nullable=False)
    auth: Mapped[str] = mapped_column(String(255), nullable=False)
    # Best-effort UA string, so the People screen can label a device.
    user_agent: Mapped[str | None] = mapped_column(String(255), default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    def to_info(self) -> dict:
        """The `subscription_info` shape `pywebpush` expects."""
        return {
            "endpoint": self.endpoint,
            "keys": {"p256dh": self.p256dh, "auth": self.auth},
        }

    def __repr__(self) -> str:  # pragma: no cover - debug aid
        return f"<PushSubscription user={self.user_id} {self.endpoint[:40]}…>"
