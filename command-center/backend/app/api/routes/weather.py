"""Weather endpoint — current conditions for the hero tile (owner)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from app.api.deps import require_owner
from app.services import weather as weather_service

router = APIRouter(tags=["weather"])


@router.get("/weather", dependencies=[Depends(require_owner)])
async def get_weather() -> dict[str, Any]:
    return await weather_service.get_weather()
