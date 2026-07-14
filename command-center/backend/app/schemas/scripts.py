"""Schemas for the laptop script runner.

The browser enqueues jobs; a poller on the Mac reports its registry, claims
queued jobs, and posts results back. See app.models.script.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ScriptInfo(BaseModel):
    """One executable the Mac offers (its filename is the id)."""

    id: str = Field(max_length=200)
    label: str = ""
    description: str = ""


class RunRequest(BaseModel):
    """Enqueue a script by id, with an optional argument string."""

    script: str = Field(min_length=1, max_length=200)
    args: str | None = Field(default=None, max_length=2000)


class JobResult(BaseModel):
    """The Mac poller posts this back after running a job."""

    exit_code: int | None = None
    stdout: str = ""
    stderr: str = ""


class ScriptJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    script: str
    args: str | None
    status: str
    exit_code: int | None
    stdout: str | None
    stderr: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
