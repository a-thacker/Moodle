"""Project model — a named goal that groups related tasks.

A project is the Phase-3 organizer above tasks: give an initiative a name and
tasks can be filed under it (`tasks.project_id`), with progress derived from how
many of its tasks are done. Projects are per-user; a user only sees their own.
Deleting a project doesn't delete its tasks — their `project_id` is set NULL so
they fall back to loose tasks.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    Float,
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


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(_AutoBigInt, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, default=None)
    color: Mapped[str | None] = mapped_column(String(20), default=None)
    # active | done | archived — drives filtering and the "completed" look.
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    # Manual sort order (lower = higher up).
    position: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )
    done_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
