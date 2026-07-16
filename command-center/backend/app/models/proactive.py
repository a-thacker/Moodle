"""Log of proactive AI notifications sent to a user.

One row per pushed nudge. Used to rate-limit (don't nudge again within the
cooldown) and de-duplicate (don't resend the same nudge within a window), so the
proactive loop never spams.
"""

from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class ProactiveLog(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "proactive_log"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    content: Mapped[str] = mapped_column(String(500), nullable=False)
    # sha256 of the normalized content, for cheap duplicate detection.
    content_hash: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
