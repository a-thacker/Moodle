"""Laptop script-runner models.

The dashboard can't run anything on Alden's Mac directly (the server can't
reach it), so this works as a queue: the browser enqueues a `ScriptJob`, a
poller on the Mac claims it, runs the matching executable from `~/cc-scripts/`,
and posts the output back. `ScriptRegistry` is a single row holding the list of
scripts the Mac currently offers, so the UI can show buttons — same
"Mac pushes, server stores" shape as `ClaudeUsage`.
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
from sqlalchemy.types import JSON

from app.db.base import Base

_AutoBigInt = BigInteger().with_variant(Integer, "sqlite")


class ScriptJob(Base):
    __tablename__ = "script_jobs"

    id: Mapped[int] = mapped_column(_AutoBigInt, primary_key=True, autoincrement=True)
    # The script's id (its filename in ~/cc-scripts/) and optional argument string.
    script: Mapped[str] = mapped_column(String(200), nullable=False)
    args: Mapped[str | None] = mapped_column(String(2000), default=None)
    # pending -> running -> done | failed
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False, index=True)
    exit_code: Mapped[int | None] = mapped_column(Integer, default=None)
    stdout: Mapped[str | None] = mapped_column(Text, default=None)
    stderr: Mapped[str | None] = mapped_column(Text, default=None)
    requested_by: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), index=True, nullable=False
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)


class ScriptRegistry(Base):
    __tablename__ = "script_registry"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    # List of {id, label, description} the Mac currently offers.
    data: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )
