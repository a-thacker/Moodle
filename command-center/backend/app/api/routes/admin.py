"""Owner-only provisioning: list the accounts and control each one's
capabilities. This is the backend for the "People" screen — the owner grants or
revokes tools per user instead of anyone editing code.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_owner
from app.core.capabilities import available_capabilities, effective_capabilities
from app.core.config import get_settings
from app.db.session import get_db
from app.models.proactive import ProactiveLog
from app.models.user import User
from app.schemas.entitlement import CapabilityInfo, EntitlementUpdate, UserEntitlements
from app.services import entitlement as entitlement_service
from app.services import ntfy
from app.services import proactive as proactive_service
from app.services import user as user_service

router = APIRouter(
    prefix="/admin", tags=["admin"], dependencies=[Depends(require_owner)]
)


@router.get("/capabilities", response_model=list[CapabilityInfo])
async def capabilities() -> list[CapabilityInfo]:
    """The capability catalog — labels/icons for the provisioning UI. Link tools
    whose URL isn't configured on this deployment are omitted (not grantable)."""
    return [
        CapabilityInfo(
            key=c.key,
            label=c.label,
            icon=c.icon,
            default_for_new_user=c.default_for_new_user,
            always=c.always,
            kind=c.kind,
        )
        for c in available_capabilities(get_settings())
    ]


async def _user_entitlements(session: AsyncSession, user: User) -> UserEntitlements:
    overrides = await entitlement_service.get_overrides(session, user.id)
    available_keys = {c.key for c in available_capabilities(get_settings())}
    caps = effective_capabilities(user.role, overrides) & available_keys
    return UserEntitlements(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
        is_active=user.is_active,
        capabilities=sorted(caps),
        overrides=overrides,
        ntfy_topic=user.ntfy_topic,
    )


@router.get("/users", response_model=list[UserEntitlements])
async def list_users(session: AsyncSession = Depends(get_db)) -> list[UserEntitlements]:
    users = await user_service.list_users(session)
    return [await _user_entitlements(session, u) for u in users]


async def _get_user_or_404(session: AsyncSession, user_id: uuid.UUID) -> User:
    user = await user_service.get_by_id(session, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such user")
    return user


@router.get("/users/{user_id}/entitlements", response_model=UserEntitlements)
async def get_entitlements(
    user_id: uuid.UUID, session: AsyncSession = Depends(get_db)
) -> UserEntitlements:
    user = await _get_user_or_404(session, user_id)
    return await _user_entitlements(session, user)


@router.put("/users/{user_id}/entitlements", response_model=UserEntitlements)
async def set_entitlements(
    user_id: uuid.UUID,
    payload: EntitlementUpdate,
    session: AsyncSession = Depends(get_db),
) -> UserEntitlements:
    user = await _get_user_or_404(session, user_id)
    await entitlement_service.set_overrides(session, user.id, payload.overrides)
    return await _user_entitlements(session, user)


@router.post("/proactive/preview")
async def proactive_preview(
    send: bool = False,
    session: AsyncSession = Depends(get_db),
    owner: User = Depends(get_current_user),
) -> dict:
    """Dry-run the proactive nudge for the owner: returns what their assistant
    would send right now (no send, no log). Pass `?send=true` to actually push
    it to the owner's own ntfy topic for an end-to-end test."""
    text = await proactive_service.decide(session, owner)
    sent = False
    if send and text and owner.ntfy_topic:
        settings = get_settings()
        await ntfy.send(owner.ntfy_topic, settings.ntfy_server, "💡 Command Center", text)
        session.add(
            ProactiveLog(
                user_id=owner.id, content=text[:500],
                content_hash=proactive_service._hash(text),
            )
        )
        await session.commit()
        sent = True
    return {"would_send": text is not None, "text": text, "sent": sent}
