"""Browser Web Push — the PWA's own notification channel (VAPID).

Two responsibilities:

- **send** one encrypted Web Push message to a subscription. `pywebpush` is
  synchronous, so the network call runs in a worker thread to keep the async
  loops free. A push service returning 404/410 means the subscription is dead;
  callers catch `PushGone` and prune it.
- **subscription CRUD** — upsert (on the endpoint, its natural key), delete, and
  list a user's subscriptions.

On iOS this delivers only to PWAs installed to the Home Screen (iOS 16.4+).
Distinct from ntfy, which still carries proactive nudges + the owner broadcast.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid

from pywebpush import WebPushException, webpush
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.push import PushSubscription

logger = logging.getLogger(__name__)


class PushGone(Exception):
    """The push service reports this subscription is gone (404/410) — prune it."""


def _send_sync(sub_info: dict, payload: str, private_key: str, subject: str) -> None:
    try:
        webpush(
            subscription_info=sub_info,
            data=payload,
            vapid_private_key=private_key,
            vapid_claims={"sub": subject},
            timeout=10,
        )
    except WebPushException as exc:
        code = getattr(exc.response, "status_code", None)
        if code in (404, 410):
            raise PushGone from exc
        raise


async def send(sub_info: dict, title: str, body: str, *, url: str = "/") -> bool:
    """Push one notification to a single subscription.

    Returns True if it was actually dispatched, False if Web Push is disabled
    (no VAPID private key). Raises `PushGone` if the subscription is dead, or
    the underlying error for any other failure.
    """
    settings = get_settings()
    if not settings.vapid_private_key:
        logger.debug("Web Push skipped: VAPID_PRIVATE_KEY not set")
        return False
    payload = json.dumps(
        {
            "title": title,
            "body": body,
            "url": url,
            "icon": settings.ntfy_icon_url or None,
        }
    )
    await asyncio.to_thread(
        _send_sync,
        sub_info,
        payload,
        settings.vapid_private_key,
        settings.vapid_subject,
    )
    return True


# --- subscription CRUD --------------------------------------------------

async def list_for_user(
    session: AsyncSession, user_id: uuid.UUID
) -> list[PushSubscription]:
    return list(
        (
            await session.execute(
                select(PushSubscription).where(PushSubscription.user_id == user_id)
            )
        )
        .scalars()
        .all()
    )


async def upsert(
    session: AsyncSession,
    user_id: uuid.UUID,
    endpoint: str,
    p256dh: str,
    auth: str,
    user_agent: str | None = None,
) -> PushSubscription:
    """Register (or refresh) a subscription. Keyed on the endpoint, so the same
    device re-subscribing updates its keys / reassigns to the current user
    rather than duplicating."""
    existing = (
        await session.execute(
            select(PushSubscription).where(PushSubscription.endpoint == endpoint)
        )
    ).scalar_one_or_none()
    if existing is not None:
        existing.user_id = user_id
        existing.p256dh = p256dh
        existing.auth = auth
        if user_agent:
            existing.user_agent = user_agent
        sub = existing
    else:
        sub = PushSubscription(
            user_id=user_id,
            endpoint=endpoint,
            p256dh=p256dh,
            auth=auth,
            user_agent=user_agent,
        )
        session.add(sub)
    await session.commit()
    await session.refresh(sub)
    return sub


async def delete_by_endpoint(
    session: AsyncSession, user_id: uuid.UUID, endpoint: str
) -> None:
    await session.execute(
        delete(PushSubscription).where(
            PushSubscription.user_id == user_id,
            PushSubscription.endpoint == endpoint,
        )
    )
    await session.commit()


async def prune_endpoint(session: AsyncSession, endpoint: str) -> None:
    """Drop a dead subscription. Does NOT commit — leaves that to the caller's
    transaction (the reminders loop batches its writes)."""
    await session.execute(
        delete(PushSubscription).where(PushSubscription.endpoint == endpoint)
    )
