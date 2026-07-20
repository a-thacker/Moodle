"""Schemas for the DVD ripper queue. See app.models.rip."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class RipRequest(BaseModel):
    """Start a movie rip. `title` should include the year, e.g. 'Cars (2006)'."""

    title: str = Field(min_length=1, max_length=300)
    extras: Literal["extras", "keep", "delete"] = "extras"


class RipProgress(BaseModel):
    """The host runner streams stdout chunks while a rip is in progress."""

    chunk: str = ""


class RipResult(BaseModel):
    """The host runner posts this when a rip finishes."""

    exit_code: int | None = None
    progress: str | None = None


class RipJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    media_type: str
    extras: str
    status: str
    progress: str | None
    exit_code: int | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
