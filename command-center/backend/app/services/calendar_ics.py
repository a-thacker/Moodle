"""Read-only iCalendar (.ics) feed import.

A user pastes a feed URL in Settings — a Google Calendar "secret address in
iCal format" or an Apple/iCloud "public calendar" link. The backend fetches it
on a schedule (and on demand), expands recurring events within a sliding window,
and upserts the occurrences into `calendar_events` via app.services.calendar.

Import-only: we never write back to the source. `webcal://` links (Apple) are
normalized to `https://`. Failures are recorded on the source row (never raised
into the loop) so Settings can surface them.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import httpx
import recurring_ical_events
from icalendar import Calendar
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import SessionFactory
from app.models.calendar import CalendarSource
from app.services import calendar as calendar_service
from app.services.calendar import NormalizedEvent

logger = logging.getLogger(__name__)

# How far back / forward to materialize recurring occurrences each sync.
_WINDOW_BACK = timedelta(days=7)
_WINDOW_FORWARD = timedelta(days=180)
_HTTP_TIMEOUT = 30


# --- Fetch ---------------------------------------------------------------


async def _fetch(url: str) -> str:
    u = url.strip()
    if u.startswith("webcal://"):  # Apple hands out webcal:// links
        u = "https://" + u[len("webcal://") :]
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, follow_redirects=True) as client:
        resp = await client.get(u, headers={"User-Agent": "CommandCenter/1.0"})
        resp.raise_for_status()
        return resp.text


# --- Parse ---------------------------------------------------------------


def _s(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _to_naive_local(value, tz: ZoneInfo) -> datetime:
    """Normalize an .ics DTSTART/DTEND to a naive local datetime, matching how
    the rest of the app stores times (naive, local wall-clock)."""
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            return value.astimezone(tz).replace(tzinfo=None)
        return value
    # A bare `date` (all-day event) → local midnight.
    return datetime.combine(value, time.min)


def _is_all_day(value) -> bool:
    return isinstance(value, date) and not isinstance(value, datetime)


def parse_ics(text: str, tz: ZoneInfo, today: date) -> list[NormalizedEvent]:
    """Parse an .ics document into normalized events, expanding recurrences
    across the sync window."""
    cal = Calendar.from_ical(text)
    window_start = today - _WINDOW_BACK
    window_end = today + _WINDOW_FORWARD
    try:
        occurrences = recurring_ical_events.of(cal).between(window_start, window_end)
    except Exception:  # noqa: BLE001 — a feed the expander chokes on: fall back
        occurrences = cal.walk("VEVENT")

    events: list[NormalizedEvent] = []
    for comp in occurrences:
        dtstart = comp.get("DTSTART")
        if dtstart is None:
            continue
        start = _to_naive_local(dtstart.dt, tz)
        end_prop = comp.get("DTEND")
        end = _to_naive_local(end_prop.dt, tz) if end_prop is not None else None
        title = _s(comp.get("SUMMARY")) or "(untitled)"
        uid = _s(comp.get("UID")) or "anon"
        # Per-occurrence key so recurring instances stay distinct, stable rows.
        external_uid = f"{uid}@{start.isoformat()}"[:500]
        events.append(
            NormalizedEvent(
                external_uid=external_uid,
                title=title[:500],
                start=start,
                end=end,
                all_day=_is_all_day(dtstart.dt),
                location=(_s(comp.get("LOCATION")) or None),
                description=(_s(comp.get("DESCRIPTION")) or None),
                url=(_s(comp.get("URL")) or None),
            )
        )
    return events


# --- Sync orchestration --------------------------------------------------


async def sync_source(session: AsyncSession, source: CalendarSource) -> CalendarSource:
    """Fetch + reconcile one .ics source. Never raises — outcome is stored on
    the row so Settings can show it. Fetch/parse (the failure-prone part) runs
    before any DB write, so a bad feed never leaves partial events."""
    if source.kind != "ics" or not source.url:
        return source

    settings = get_settings()
    tz = ZoneInfo(settings.timezone)
    try:
        text = await _fetch(source.url)
        parsed = parse_ics(text, tz, datetime.now(tz).date())
    except Exception as exc:  # noqa: BLE001 — surface any network/parse error
        source.last_sync_ok = False
        source.last_sync_error = str(exc)[:1000]
        source.last_synced_at = datetime.utcnow()
        await session.commit()
        await session.refresh(source)
        logger.warning("Calendar source %s sync failed: %s", source.id, exc)
        return source

    count = await calendar_service.upsert_events(session, source, parsed)
    source.event_count = count
    source.last_sync_ok = True
    source.last_sync_error = None
    source.last_synced_at = datetime.utcnow()
    await session.commit()
    await session.refresh(source)
    return source


async def sync_all_ics_sources() -> None:
    async with SessionFactory() as session:
        sources = (
            await session.execute(
                select(CalendarSource).where(
                    CalendarSource.kind == "ics",
                    CalendarSource.enabled.is_(True),
                )
            )
        ).scalars().all()
        for source in sources:
            await sync_source(session, source)


async def calendar_sync_loop() -> None:
    settings = get_settings()
    interval = max(1, settings.calendar_sync_interval_minutes) * 60
    logger.info(
        "Calendar sync loop started (every %s min).",
        settings.calendar_sync_interval_minutes,
    )
    while True:
        await asyncio.sleep(interval)
        try:
            await sync_all_ics_sources()
        except Exception as exc:  # never let the loop die
            logger.warning("Calendar sync tick failed: %s", exc)
