"""Calendar — a provider-agnostic, per-user calendar.

The Command Center holds one unified calendar per user, fed by any number of
*sources*:

- `eclass`  the school (Moodle) calendar, pushed by the sync agent (owner only).
- `ics`     a read-only iCalendar feed the user pasted in Settings — a Google
            "secret iCal address" or an Apple "public calendar" link.

`CalendarSource` is the registration + sync bookkeeping (mirrors `VaultRepo`).
`CalendarEvent` is the imported event mirror: read-only copies kept in sync with
their source and keyed by `(source_id, external_uid)` so a re-sync upserts
rather than duplicates. Events are never edited here — to act on one the user
spins off a real `Task` (see the planner). Everything is scoped to `user_id`, so
one account never sees another's calendar.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# Portable autoincrement PK (BigInteger on Postgres, Integer/rowid on SQLite).
_AutoBigInt = BigInteger().with_variant(Integer, "sqlite")


class CalendarSource(Base):
    __tablename__ = "calendar_sources"

    id: Mapped[int] = mapped_column(_AutoBigInt, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # "eclass" (agent-fed) | "ics" (read-only feed URL).
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    # Display color (hex) for this source's events on the calendar/planner.
    color: Mapped[str | None] = mapped_column(String(20), default=None)
    # The feed URL for kind="ics"; NULL for the agent-fed "eclass" source.
    url: Mapped[str | None] = mapped_column(String(1000), default=None)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Sync bookkeeping (updated after each fetch).
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    last_sync_ok: Mapped[bool | None] = mapped_column(Boolean, default=None)
    last_sync_error: Mapped[str | None] = mapped_column(Text, default=None)
    event_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )


class CalendarEvent(Base):
    __tablename__ = "calendar_events"
    __table_args__ = (
        UniqueConstraint("source_id", "external_uid", name="uq_calendar_events_source_uid"),
    )

    id: Mapped[int] = mapped_column(_AutoBigInt, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_id: Mapped[int] = mapped_column(
        _AutoBigInt,
        ForeignKey("calendar_sources.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Denormalized source kind ("eclass"/"ics"/"manual") for quick filtering.
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    # Stable per-source id: the eClass event id, or "<UID>@<occurrence-start>"
    # for an .ics event (so recurring occurrences stay distinct rows).
    external_uid: Mapped[str] = mapped_column(String(500), nullable=False)

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, default=None)
    location: Mapped[str | None] = mapped_column(String(500), default=None)
    url: Mapped[str | None] = mapped_column(String(1000), default=None)
    start: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=False)
    end: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    all_day: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # eClass extra — the course an event belongs to (NULL for personal feeds).
    course_name: Mapped[str | None] = mapped_column(String(255), default=None)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )
