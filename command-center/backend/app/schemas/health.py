"""Response schemas for the health endpoints."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class HealthStatus(BaseModel):
    status: Literal["ok"] = "ok"
    app: str
    version: str
    environment: str


class DatabaseHealth(BaseModel):
    database: Literal["ok", "error"]
    detail: str | None = None
