"""Weather endpoint — current conditions for the hero tile (owner)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from app.api.deps import require_owner
from app.services import weather as weather_service

router = APIRouter(tags=["weather"])


@router.get("/weather", dependencies=[Depends(require_owner)])
async def get_weather(
    lat: float | None = None, lon: float | None = None, label: str | None = None
) -> dict[str, Any]:
    """Current conditions. With lat/lon, use that location (from the dashboard's
    location picker); otherwise the configured default."""
    return await weather_service.get_weather(lat, lon, label)
