"""Task schemas. Read model serializes camelCase for the frontend."""

from __future__ import annotations

from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

CATEGORIES = {"school", "meeting", "home", "work"}


def _norm_category(value: str | None) -> str | None:
    if not value:
        return None
    v = value.strip().lower()
    return v if v in CATEGORIES else None


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    body: str | None = None
    due_date: date | None = None
    due_time: time | None = None
    category: str | None = None

    @field_validator("category")
    @classmethod
    def _cat(cls, v: str | None) -> str | None:
        return _norm_category(v)


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    body: str | None = None
    done: bool | None = None
    due_date: date | None = None
    due_time: time | None = None
    category: str | None = None
    position: float | None = None

    @field_validator("category")
    @classmethod
    def _cat(cls, v: str | None) -> str | None:
        return _norm_category(v)


class TaskRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)

    id: int
    title: str
    body: str | None
    done: bool
    due_date: date | None
    due_time: time | None
    category: str | None
    position: float
    created_at: datetime
    done_at: datetime | None
