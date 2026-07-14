"""Schemas for eClass data.

Ingest schemas (agent → API) use snake_case; read schemas (API → frontend)
serialize camelCase to match the TypeScript types (Course, Deadline,
GradeEvent) in the frontend.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class _CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


# --- Ingest (agent → API) ------------------------------------------------


class CourseIn(BaseModel):
    id: int
    short_name: str
    full_name: str
    hidden: bool = False


class GradeSnapshotIn(BaseModel):
    course_id: int
    report: dict


class GradeEventIn(BaseModel):
    course_id: int
    kind: str
    item_name: str
    category: str | None = None
    old: str | None = None
    new: str | None = None
    is_total: bool = False


class TimelineEventIn(BaseModel):
    id: int
    name: str
    due: datetime
    module: str | None = None
    course_id: int | None = None
    course_name: str | None = None
    url: str | None = None
    overdue: bool = False


# --- Read (API → frontend) ----------------------------------------------


class CourseRead(_CamelModel):
    id: int
    short_name: str
    full_name: str
    total_percent: float | None = None


class GradeEventRead(_CamelModel):
    id: int
    kind: str
    title: str
    detail: str | None = None


class DeadlineRead(_CamelModel):
    id: int
    title: str
    course_name: str
    module: str
    due: datetime
    overdue: bool
