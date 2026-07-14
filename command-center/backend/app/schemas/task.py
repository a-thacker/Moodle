"""Task schemas. Read model serializes camelCase for the frontend."""

from __future__ import annotations

from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    body: str | None = None
    due_date: date | None = None
    due_time: time | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    body: str | None = None
    done: bool | None = None
    due_date: date | None = None
    due_time: time | None = None
    position: float | None = None


class TaskRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)

    id: int
    title: str
    body: str | None
    done: bool
    due_date: date | None
    due_time: time | None
    position: float
    created_at: datetime
    done_at: datetime | None
