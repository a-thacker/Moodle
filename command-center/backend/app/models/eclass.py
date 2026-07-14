"""eClass (Moodle) data — the tables the sync agent writes and the owner
dashboard reads. Ported from the old Supabase Hub schema.

- Course           enrolled courses (Moodle id as PK)
- GradeSnapshot    a full GradeReport.to_dict() per fetch (grade history)
- GradeEvent       one row per detected change (the "what changed" feed)
- TimelineEvent    upcoming due dates (mirrors "what's upcoming")
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.db.base import Base, TimestampMixin

# Portable autoincrement PK (BigInteger on Postgres, Integer/rowid on SQLite).
_AutoBigInt = BigInteger().with_variant(Integer, "sqlite")


class Course(TimestampMixin, Base):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)  # Moodle id
    short_name: Mapped[str] = mapped_column(String(120), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    hidden: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class GradeSnapshot(Base):
    __tablename__ = "grade_snapshots"

    id: Mapped[int] = mapped_column(_AutoBigInt, primary_key=True, autoincrement=True)
    course_id: Mapped[int] = mapped_column(BigInteger, index=True, nullable=False)
    report: Mapped[dict] = mapped_column(JSON, nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )


class GradeEvent(Base):
    __tablename__ = "grade_events"

    id: Mapped[int] = mapped_column(_AutoBigInt, primary_key=True, autoincrement=True)
    course_id: Mapped[int] = mapped_column(BigInteger, index=True, nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # graded/changed/feedback
    item_name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str | None] = mapped_column(String(255), default=None)
    old: Mapped[str | None] = mapped_column(String(255), default=None)
    new: Mapped[str | None] = mapped_column(String(255), default=None)
    is_total: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    detected_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), index=True, nullable=False
    )


class TimelineEvent(Base):
    __tablename__ = "timeline_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)  # Moodle event id
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    due: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=False)
    module: Mapped[str | None] = mapped_column(String(40), default=None)
    course_id: Mapped[int | None] = mapped_column(BigInteger, default=None)
    course_name: Mapped[str | None] = mapped_column(String(255), default=None)
    url: Mapped[str | None] = mapped_column(String(512), default=None)
    overdue: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )
