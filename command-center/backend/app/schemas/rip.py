"""Schemas for the DVD ripper queue. See app.models.rip."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class RipRequest(BaseModel):
    """Start a rip. For a movie, `title` (include the year, e.g. 'Cars (2006)').
    For a TV disc, `show` + `season` + `start_episode` + `episode_count` — the
    episodes on this disc are named "<Show> - SxxEyy"."""

    media_type: Literal["movie", "tv"] = "movie"

    # Movie
    title: str | None = Field(default=None, max_length=300)
    extras: Literal["extras", "keep", "delete"] = "extras"

    # TV
    show: str | None = Field(default=None, max_length=300)
    season: int | None = Field(default=None, ge=0, le=99)
    start_episode: int | None = Field(default=None, ge=1, le=999)
    episode_count: int | None = Field(default=None, ge=1, le=99)

    @model_validator(mode="after")
    def _require_fields(self) -> "RipRequest":
        if self.media_type == "movie":
            if not (self.title and self.title.strip()):
                raise ValueError("A movie rip needs a title.")
        else:  # tv
            missing = []
            if not (self.show and self.show.strip()):
                missing.append("show")
            if self.season is None:
                missing.append("season")
            if self.start_episode is None:
                missing.append("start_episode")
            if self.episode_count is None:
                missing.append("episode_count")
            if missing:
                raise ValueError(f"A TV rip needs: {', '.join(missing)}.")
        return self


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
    show_name: str | None = None
    season: int | None = None
    start_episode: int | None = None
    episode_count: int | None = None
    status: str
    progress: str | None
    exit_code: int | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
