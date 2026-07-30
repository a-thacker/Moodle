"""Schemas for the Obsidian vault hub. See app.models.vault + app.services.vault."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class VaultCreate(BaseModel):
    """Register a git-backed Obsidian vault."""

    name: str = Field(min_length=1, max_length=120)
    git_url: str = Field(min_length=1, max_length=500)
    branch: str = Field(default="main", max_length=120)
    subpath: str = Field(default="", max_length=300)
    ai_readable: bool = False


class VaultUpdate(BaseModel):
    """Partial edit — only provided fields change."""

    name: str | None = Field(default=None, max_length=120)
    git_url: str | None = Field(default=None, max_length=500)
    branch: str | None = Field(default=None, max_length=120)
    subpath: str | None = Field(default=None, max_length=300)
    ai_readable: bool | None = None


class VaultOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    git_url: str
    branch: str
    subpath: str
    ai_readable: bool
    last_synced_at: datetime | None
    last_sync_ok: bool | None
    last_sync_error: str | None
    note_count: int
    created_at: datetime


class NoteMeta(BaseModel):
    path: str
    title: str
    size: int
    modified: datetime


class NoteContent(BaseModel):
    path: str
    markdown: str
