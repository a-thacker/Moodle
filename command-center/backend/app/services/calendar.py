"""Calendar logic: source CRUD, event upserts, and the eClass ingest bridge.

The store is provider-agnostic — `upsert_events` takes a normalized event list
and reconciles it against one source (insert new, update changed, drop events
that vanished upstream), keyed by `external_uid`. The eClass agent path and the
`.ics` fetch path (see app.services.calendar_ics) both feed through it.

All reads are scoped to a `user_id`; a user only ever sees their own calendar.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.calendar import CalendarEvent, CalendarSource
from app.models.user import User
from app.schemas.calendar import IngestCalendarEvent

# A default color per built-in source kind (used when the user sets none).
_ECLASS_COLOR = "#7c9cff"


def _naive_local(dt: datetime | None) -> datetime | None:
    """Normalize to naive app-local wall-clock — matching how tasks and .ics
    events are stored. The agent sends tz-aware eClass times, but the DB columns
    are naive and the container runs UTC, so an aware value would shift or be
    rejected by the driver."""
    if dt is None or dt.tzinfo is None:
        return dt
    return dt.astimezone(ZoneInfo(get_settings().timezone)).replace(tzinfo=None)


@dataclass(slots=True)
class NormalizedEvent:
    """A provider-neutral event ready to upsert into `calendar_events`."""

    external_uid: str
    title: str
    start: datetime
    end: datetime | None = None
    all_day: bool = False
    location: str | None = None
    description: str | None = None
    url: str | None = None
    course_name: str | None = None


# --- Event reconciliation -------------------------------------------------


async def upsert_events(
    session: AsyncSession, source: CalendarSource, events: list[NormalizedEvent]
) -> int:
    """Reconcile `events` against `source`: upsert by `external_uid`, then drop
    any existing events for this source that are no longer present upstream.

    Does NOT commit — the caller owns the transaction (so status bookkeeping and
    the event changes land together).
    """
    seen = {e.external_uid for e in events}
    existing_rows = (
        await session.execute(
            select(CalendarEvent).where(CalendarEvent.source_id == source.id)
        )
    ).scalars().all()
    by_uid = {row.external_uid: row for row in existing_rows}

    for ev in events:
        row = by_uid.get(ev.external_uid)
        if row is None:
            session.add(
                CalendarEvent(
                    user_id=source.user_id,
                    source_id=source.id,
                    source=source.kind,
                    external_uid=ev.external_uid,
                    title=ev.title,
                    description=ev.description,
                    location=ev.location,
                    url=ev.url,
                    start=ev.start,
                    end=ev.end,
                    all_day=ev.all_day,
                    course_name=ev.course_name,
                )
            )
        else:
            row.title = ev.title
            row.description = ev.description
            row.location = ev.location
            row.url = ev.url
            row.start = ev.start
            row.end = ev.end
            row.all_day = ev.all_day
            row.course_name = ev.course_name

    stale = [uid for uid in by_uid if uid not in seen]
    if stale:
        await session.execute(
            delete(CalendarEvent).where(
                CalendarEvent.source_id == source.id,
                CalendarEvent.external_uid.in_(stale),
            )
        )
    return len(events)


# --- Source CRUD (per-user .ics feeds) -----------------------------------


async def list_sources(
    session: AsyncSession, user_id: uuid.UUID
) -> list[CalendarSource]:
    result = await session.execute(
        select(CalendarSource)
        .where(CalendarSource.user_id == user_id)
        .order_by(CalendarSource.created_at.asc())
    )
    return list(result.scalars().all())


async def get_source(
    session: AsyncSession, user_id: uuid.UUID, source_id: int
) -> CalendarSource | None:
    source = await session.get(CalendarSource, source_id)
    if source is None or source.user_id != user_id:
        return None
    return source


async def create_ics_source(
    session: AsyncSession,
    user_id: uuid.UUID,
    label: str,
    url: str,
    color: str | None,
) -> CalendarSource:
    source = CalendarSource(
        user_id=user_id,
        kind="ics",
        label=label.strip()[:120],
        url=url.strip()[:1000],
        color=(color.strip()[:20] if color else None),
        enabled=True,
    )
    session.add(source)
    await session.commit()
    await session.refresh(source)
    return source


async def update_source(
    session: AsyncSession, source: CalendarSource, patch: dict
) -> tuple[CalendarSource, bool]:
    """Apply changed fields. Returns (source, resync) where `resync` is True if
    the feed URL moved (the caller should re-fetch)."""
    resync = False
    if "label" in patch and patch["label"] is not None:
        source.label = str(patch["label"]).strip()[:120]
    if "color" in patch:
        color = patch["color"]
        source.color = str(color).strip()[:20] if color else None
    if "enabled" in patch and patch["enabled"] is not None:
        source.enabled = bool(patch["enabled"])
    if "url" in patch and patch["url"] and source.kind == "ics":
        new_url = str(patch["url"]).strip()[:1000]
        resync = new_url != source.url
        source.url = new_url
    await session.commit()
    await session.refresh(source)
    return source, resync


async def delete_source(session: AsyncSession, source: CalendarSource) -> None:
    # Events cascade-delete via the FK.
    await session.delete(source)
    await session.commit()


# --- eClass ingest bridge -------------------------------------------------


async def get_or_create_eclass_source(
    session: AsyncSession, user_id: uuid.UUID
) -> CalendarSource:
    existing = (
        await session.execute(
            select(CalendarSource).where(
                CalendarSource.user_id == user_id,
                CalendarSource.kind == "eclass",
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing
    source = CalendarSource(
        user_id=user_id, kind="eclass", label="eClass", color=_ECLASS_COLOR, enabled=True
    )
    session.add(source)
    await session.commit()
    await session.refresh(source)
    return source


async def _owner(session: AsyncSession) -> User | None:
    """The owner account — eClass data belongs to them (the agent runs on the
    owner's machine with the owner's session)."""
    return (
        await session.execute(
            select(User).where(User.role == "owner").order_by(User.created_at.asc()).limit(1)
        )
    ).scalar_one_or_none()


async def replace_eclass_calendar(
    session: AsyncSession, events: list[IngestCalendarEvent]
) -> int:
    """Mirror the owner's eClass calendar into their `eclass` source."""
    owner = await _owner(session)
    if owner is None:
        return 0
    source = await get_or_create_eclass_source(session, owner.id)
    normalized = [
        NormalizedEvent(
            external_uid=str(e.id),
            title=e.name,
            start=_naive_local(e.start),  # type: ignore[arg-type]
            end=_naive_local(e.end),
            location=e.location,
            url=e.url,
            course_name=e.course_name,
        )
        for e in events
    ]
    count = await upsert_events(session, source, normalized)
    source.event_count = count
    source.last_synced_at = datetime.utcnow()
    source.last_sync_ok = True
    source.last_sync_error = None
    await session.commit()
    return count


# --- Reads ----------------------------------------------------------------


async def list_events(
    session: AsyncSession,
    user_id: uuid.UUID,
    start: datetime | None = None,
    end: datetime | None = None,
) -> list[CalendarEvent]:
    stmt = select(CalendarEvent).where(CalendarEvent.user_id == user_id)
    if start is not None:
        stmt = stmt.where(CalendarEvent.start >= start)
    if end is not None:
        stmt = stmt.where(CalendarEvent.start <= end)
    result = await session.execute(stmt.order_by(CalendarEvent.start.asc()))
    return list(result.scalars().all())
