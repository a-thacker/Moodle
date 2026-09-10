"""Web Push subscription endpoints (the PWA's own notification channel).

    GET  /push/vapid-public-key   the VAPID public key for pushManager.subscribe
    POST /push/subscribe          register this browser's push subscription
    POST /push/unsubscribe        drop it (endpoint in body; best-effort)

Any authenticated user; subscriptions are scoped to their owner. The public
key is not a secret, so its endpoint is open.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.models.user import User
from app.schemas.push import PushSubscriptionIn, PushUnsubscribeIn, VapidKeyOut
from app.services import webpush

router = APIRouter(prefix="/push", tags=["push"])


@router.get("/vapid-public-key", response_model=VapidKeyOut)
async def vapid_public_key(
    settings: Settings = Depends(get_settings),
) -> VapidKeyOut:
    return VapidKeyOut(public_key=settings.vapid_public_key)


@router.post("/subscribe", status_code=status.HTTP_204_NO_CONTENT)
async def subscribe(
    payload: PushSubscriptionIn,
    user_agent: str | None = Header(default=None),
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    await webpush.upsert(
        session,
        user.id,
        payload.endpoint,
        payload.keys.p256dh,
        payload.keys.auth,
        user_agent,
    )


@router.post("/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe(
    payload: PushUnsubscribeIn,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    await webpush.delete_by_endpoint(session, user.id, payload.endpoint)
