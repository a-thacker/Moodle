"""Reading and writing per-user capability entitlements."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.capabilities import CAPABILITY_KEYS, effective_capabilities
from app.models.entitlement import UserEntitlement
from app.models.user import User


async def get_overrides(session: AsyncSession, user_id: uuid.UUID) -> dict[str, bool]:
    """The raw per-user overrides (capability → enabled). Absence = role default."""
    result = await session.execute(
        select(UserEntitlement).where(UserEntitlement.user_id == user_id)
    )
    return {e.capability: e.enabled for e in result.scalars().all()}


async def effective_for(session: AsyncSession, user: User) -> set[str]:
    """The user's real capability set (role default + overrides)."""
    overrides = await get_overrides(session, user.id)
    return effective_capabilities(user.role, overrides)


async def set_overrides(
    session: AsyncSession, user_id: uuid.UUID, overrides: dict[str, bool]
) -> None:
    """Upsert the given capability overrides for a user. Unknown capability keys
    are ignored so a stale client can't create junk rows."""
    existing = {
        e.capability: e
        for e in (
            await session.execute(
                select(UserEntitlement).where(UserEntitlement.user_id == user_id)
            )
        ).scalars()
    }
    for capability, enabled in overrides.items():
        if capability not in CAPABILITY_KEYS:
            continue
        row = existing.get(capability)
        if row is None:
            session.add(
                UserEntitlement(
                    user_id=user_id, capability=capability, enabled=bool(enabled)
                )
            )
        else:
            row.enabled = bool(enabled)
    await session.commit()
