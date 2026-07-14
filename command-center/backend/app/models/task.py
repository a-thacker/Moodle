"""Task model — the quick note-taker's storage.

Jot a line and it becomes a task. Tasks belong to a user. An optional
`due_date` lets the (future) weekly planner place a task on a day; `body`
holds longer note text when a one-line title isn't enough.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
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


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(_AutoBigInt, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, default=None)
    done: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date, default=None, index=True)
    # Manual sort order (within a day / list). Lower = higher up.
    position: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), index=True, nullable=False
    )
    done_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
