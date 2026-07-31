"""Calendar endpoints.

Ingest (agent, X-API-Key):
    PUT  /ingest/calendar          the owner's eClass calendar (upsert-and-prune)

Browser (needs the `calendar` capability; every row scoped to the caller):
    GET    /calendar/events?from=&to=   the caller's merged calendar
    GET    /calendar/sources            the caller's feeds + sync status
    POST   /calendar/sources            add an .ics feed (fetches immediately)
    PATCH  /calendar/sources/{id}       edit a feed (re-fetches if the URL moved)
    DELETE /calendar/sources/{id}       remove a feed (drops its events)
    POST   /calendar/sources/{id}/sync  fetch the feed now
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_agent_key, require_capability
from app.db.session import get_db
from app.models.user import User
from app.schemas.calendar import (
    CalendarEventRead,
    CalendarSourceCreate,
    CalendarSourceOut,
    CalendarSourceUpdate,
    IngestCalendarEvent,
)
from app.services import calendar as calendar_service
from app.services import calendar_ics

router = APIRouter(tags=["calendar"])

# --- Ingest (machine-to-machine) ----------------------------------------
ingest = APIRouter(prefix="/ingest", dependencies=[Depends(require_agent_key)])


@ingest.put("/calendar")
async def ingest_calendar(
    events: list[IngestCalendarEvent], session: AsyncSession = Depends(get_db)
) -> dict[str, int]:
    return {"synced": await calendar_service.replace_eclass_calendar(session, events)}


# --- Browser (capability-gated) -----------------------------------------
reads = APIRouter(prefix="/calendar")
require_calendar = require_capability("calendar")


async def _load(session: AsyncSession, user: User, source_id: int):
    source = await calendar_service.get_source(session, user.id, source_id)
    if source is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown calendar source")
    return source


@reads.get("/events", response_model=list[CalendarEventRead])
async def list_events(
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None, alias="to"),
    session: AsyncSession = Depends(get_db),
    user: User = Depends(require_calendar),
) -> list[CalendarEventRead]:
    events = await calendar_service.list_events(session, user.id, from_, to)
    return [CalendarEventRead.model_validate(e) for e in events]


@reads.get("/sources", response_model=list[CalendarSourceOut])
async def list_sources(
    session: AsyncSession = Depends(get_db), user: User = Depends(require_calendar)
) -> list[CalendarSourceOut]:
    sources = await calendar_service.list_sources(session, user.id)
    return [CalendarSourceOut.model_validate(s) for s in sources]


@reads.post("/sources", response_model=CalendarSourceOut, status_code=status.HTTP_201_CREATED)
async def create_source(
    payload: CalendarSourceCreate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(require_calendar),
) -> CalendarSourceOut:
    source = await calendar_service.create_ics_source(
        session, user.id, payload.label, payload.url, payload.color
    )
    # Fetch immediately so the calendar populates right away.
    source = await calendar_ics.sync_source(session, source)
    return CalendarSourceOut.model_validate(source)


@reads.patch("/sources/{source_id}", response_model=CalendarSourceOut)
async def update_source(
    source_id: int,
    payload: CalendarSourceUpdate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(require_calendar),
) -> CalendarSourceOut:
    source = await _load(session, user, source_id)
    source, resync = await calendar_service.update_source(
        session, source, payload.model_dump(exclude_unset=True)
    )
    if resync:
        source = await calendar_ics.sync_source(session, source)
    return CalendarSourceOut.model_validate(source)


@reads.delete("/sources/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_source(
    source_id: int,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(require_calendar),
) -> None:
    source = await _load(session, user, source_id)
    await calendar_service.delete_source(session, source)


@reads.post("/sources/{source_id}/sync", response_model=CalendarSourceOut)
async def sync_source(
    source_id: int,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(require_calendar),
) -> CalendarSourceOut:
    source = await _load(session, user, source_id)
    source = await calendar_ics.sync_source(session, source)
    return CalendarSourceOut.model_validate(source)


router.include_router(ingest)
router.include_router(reads)
