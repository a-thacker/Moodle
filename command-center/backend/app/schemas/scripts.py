"""Schemas for the in-site script/command runner."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ScriptInfo(BaseModel):
    id: str
    label: str
    description: str


class RunRequest(BaseModel):
    """Run a registered script by id, or an arbitrary command. One of the two."""

    script_id: str | None = None
    command: str | None = Field(default=None, max_length=8000)


class RunResult(BaseModel):
    command: str
    stdout: str
    stderr: str
    exit_code: int | None
    duration_ms: int
    timed_out: bool
