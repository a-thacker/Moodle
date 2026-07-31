"""Schemas for the calendar.

Ingest schemas (agent → API) are snake_case and mirror `eclass.CalendarEvent`.
Read/CRUD schemas (API → frontend) serialize camelCase to match the TypeScript
types. See app.models.calendar + app.services.calendar.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class _CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, from_attributes=True
    )


# --- Ingest (agent → API): the owner's eClass calendar -------------------


class IngestCalendarEvent(BaseModel):
    """One event from `eclass.CalendarEvent.to_dict()` (the sync agent)."""

    id: int
    name: str
    start: datetime
    end: datetime | None = None
    event_type: str | None = None
    course_id: int | None = None
    course_name: str | None = None
    location: str | None = None
    url: str | None = None


# --- Source CRUD (browser → API): a user's .ics feeds --------------------


class CalendarSourceCreate(BaseModel):
    """Register a read-only iCalendar feed (Google/Apple 'secret' URL)."""

    label: str = Field(min_length=1, max_length=120)
    url: str = Field(min_length=1, max_length=1000)
    color: str | None = Field(default=None, max_length=20)


class CalendarSourceUpdate(BaseModel):
    """Partial edit — only provided fields change."""

    label: str | None = Field(default=None, max_length=120)
    url: str | None = Field(default=None, max_length=1000)
    color: str | None = Field(default=None, max_length=20)
    enabled: bool | None = None


class CalendarSourceOut(_CamelModel):
    id: int
    kind: str
    label: str
    color: str | None
    url: str | None
    enabled: bool
    last_synced_at: datetime | None
    last_sync_ok: bool | None
    last_sync_error: str | None
    event_count: int
    created_at: datetime


# --- Read (API → frontend): the merged calendar --------------------------


class CalendarEventRead(_CamelModel):
    id: int
    source_id: int
    source: str
    title: str
    description: str | None
    location: str | None
    url: str | None
    start: datetime
    end: datetime | None
    all_day: bool
    course_name: str | None
