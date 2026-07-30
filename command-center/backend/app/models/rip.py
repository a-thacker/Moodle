"""DVD ripper job.

Same "backend is only a queue" shape as the laptop script runner
(`app.models.script`): the browser enqueues a `RipJob`, a poller on the server
host (`~/cc-agent/rip-runner.py`) claims it, runs the non-interactive rip script
with makemkvcon, streams progress back, and posts the final result. Nothing rips
inside the backend container — the optical drive lives on the host.
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


class RipJob(Base):
    __tablename__ = "rip_jobs"

    id: Mapped[int] = mapped_column(_AutoBigInt, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    media_type: Mapped[str] = mapped_column(String(20), default="movie", nullable=False)
    # How to handle the non-main MKVs: extras | keep | delete (movies only).
    extras: Mapped[str] = mapped_column(String(20), default="extras", nullable=False)
    # TV shows (media_type == "tv"): describes the episodes on this disc; the
    # ripper names them "<Show> - SxxEyy.mkv". Null for movies.
    show_name: Mapped[str | None] = mapped_column(String(300), default=None)
    season: Mapped[int | None] = mapped_column(Integer, default=None)
    start_episode: Mapped[int | None] = mapped_column(Integer, default=None)
    episode_count: Mapped[int | None] = mapped_column(Integer, default=None)
    # pending -> running -> done | failed
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False, index=True)
    # Live streamed stdout from the ripper (progress), plus final output.
    progress: Mapped[str | None] = mapped_column(Text, default=None)
    exit_code: Mapped[int | None] = mapped_column(Integer, default=None)
    requested_by: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), index=True, nullable=False
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
