"""Project schemas. Read model serializes camelCase for the frontend and
carries derived task counts. See app.models.project + app.services.project."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

STATUSES = {"active", "done", "archived"}


def _norm_status(value: str | None) -> str | None:
    if not value:
        return None
    v = value.strip().lower()
    return v if v in STATUSES else None


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    color: str | None = Field(default=None, max_length=20)


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    color: str | None = Field(default=None, max_length=20)
    status: str | None = None
    position: float | None = None

    @field_validator("status")
    @classmethod
    def _status(cls, v: str | None) -> str | None:
        return _norm_status(v)


class ProjectRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)

    id: int
    name: str
    description: str | None
    color: str | None
    status: str
    position: float
    created_at: datetime
    done_at: datetime | None
    # Derived progress (filled by the service, not columns).
    task_count: int = 0
    done_count: int = 0
