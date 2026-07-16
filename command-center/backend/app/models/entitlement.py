"""Per-user capability entitlement.

Each row is an *override* of a user's role default for one capability: presence
means "force this capability to `enabled`", absence means "use the role
default" (see `app.core.capabilities`). This is what makes provisioning
self-serve — the owner flips a switch instead of shipping code.
"""

from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class UserEntitlement(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "user_entitlements"
    __table_args__ = (
        UniqueConstraint("user_id", "capability", name="uq_user_entitlement"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    capability: Mapped[str] = mapped_column(String(64), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False)

    def __repr__(self) -> str:  # pragma: no cover - debug aid
        state = "on" if self.enabled else "off"
        return f"<UserEntitlement {self.capability}={state} user={self.user_id}>"
