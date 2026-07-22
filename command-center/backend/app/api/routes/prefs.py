"""Per-user UI preferences.

    GET /prefs   → the signed-in user's preferences blob
    PUT /prefs   → shallow-merge a patch of top-level keys, returns the result

Preferences are opaque to the server (sidebar order/visibility, dashboard tile
arrangement, weather location, …). Storing them per account — instead of in each
browser's localStorage — is what makes a user's layout follow them across
devices.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.services import user as user_service

router = APIRouter(prefix="/prefs", tags=["prefs"])


@router.get("")
async def get_prefs(
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    return current_user.preferences or {}


@router.put("")
async def update_prefs(
    patch: dict[str, Any] = Body(...),
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    return await user_service.update_preferences(session, current_user, patch)
