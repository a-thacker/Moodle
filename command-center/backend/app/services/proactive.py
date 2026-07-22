"""Proactive AI notifications.

A background loop that, for each user with the `assistant` capability and an ntfy
topic, periodically asks *their* assistant whether a short, timely nudge is worth
sending right now — based on their live Command Center context — then pushes it
to their phone. Off by default (`PROACTIVE_ENABLED`). Rate-limited per user
(cooldown) and de-duplicated (content hash) so it never spams.

Routing reuses `assistant.complete`, so the owner's nudges come from the Claude
bridge (subscription) and everyone else's from Codex/OpenAI — never the paid API
unless explicitly configured. The bridge memory is namespaced (`proactive-…`) so
this never pollutes the interactive chat.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import SessionFactory
from app.models.proactive import ProactiveLog
from app.models.user import User
from app.services import assistant as assistant_service
from app.services import entitlement as entitlement_service
from app.services import ntfy
from app.services import usage as usage_service
from app.services.context import build_user_context

logger = logging.getLogger(__name__)

_SYSTEM = (
    "You are the proactive side of {name}'s personal Command Center assistant. "
    "Decide whether to send ONE short, genuinely useful phone notification right "
    "now, from their live context and the time of day — e.g. a deadline "
    "approaching with no plan for it, a timed task coming up, or a good moment to "
    "plan the day or week. Be specific, warm, and brief; never naggy.\n"
    "If nothing clearly warrants interrupting them right now, reply with EXACTLY "
    "'NONE' and nothing else. Otherwise reply with ONLY the notification text — "
    "one or two sentences, under 220 characters, no preamble or quotes."
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _hash(text: str) -> str:
    return hashlib.sha256(text.strip().lower().encode("utf-8")).hexdigest()


async def _eligible_users(session: AsyncSession) -> list[User]:
    """Active users who have both the assistant capability and an ntfy topic."""
    result = await session.execute(select(User).where(User.is_active.is_(True)))
    users: list[User] = []
    for user in result.scalars():
        if not user.ntfy_topic:
            continue
        caps = await entitlement_service.effective_for(session, user)
        if "assistant" in caps:
            users.append(user)
    return users


async def _has_log_since(session: AsyncSession, user_id, since: datetime,
                         content_hash: str | None = None) -> bool:
    stmt = select(ProactiveLog.id).where(
        ProactiveLog.user_id == user_id, ProactiveLog.created_at >= since
    )
    if content_hash is not None:
        stmt = stmt.where(ProactiveLog.content_hash == content_hash)
    return (await session.execute(stmt.limit(1))).first() is not None


async def decide(session: AsyncSession, user: User) -> str | None:
    """Ask the user's assistant whether to nudge now. Returns the notification
    text, or None to stay quiet. No side effects (safe for previews)."""
    settings = get_settings()
    now_local = datetime.now(ZoneInfo(settings.timezone))
    first_name = (user.display_name or "the user").split()[0]
    context = await build_user_context(session, user)
    message = (
        f"Current time: {now_local:%A, %B %d, %Y, %-I:%M %p}.\n\n"
        f"LIVE CONTEXT\n{context}\n\n"
        "Decide now: reply 'NONE', or the single notification to send."
    )
    reply = await assistant_service.complete(
        user, _SYSTEM.format(name=first_name), message, thread="proactive-"
    )
    if not reply or reply.strip().upper().startswith("NONE"):
        return None
    return reply.strip().strip('"').strip()[:400]


async def check_proactive() -> None:
    """One pass: for each eligible user past their cooldown, maybe send a nudge."""
    settings = get_settings()
    if not settings.proactive_enabled:
        return
    now = _utcnow()
    cooldown_since = now - timedelta(minutes=settings.proactive_cooldown_minutes)
    dedup_since = now - timedelta(hours=settings.proactive_dedup_hours)

    async with SessionFactory() as session:
        for user in await _eligible_users(session):
            try:
                if await _has_log_since(session, user.id, cooldown_since):
                    continue  # nudged too recently
                text = await decide(session, user)
                if not text:
                    continue
                if await _has_log_since(session, user.id, dedup_since, _hash(text)):
                    continue  # same nudge already sent recently
                await ntfy.send(
                    user.ntfy_topic, settings.ntfy_server, "Command Center", text,
                    tags="bulb",
                )
                session.add(
                    ProactiveLog(user_id=user.id, content=text[:500], content_hash=_hash(text))
                )
                await session.commit()
                logger.info("Proactive nudge sent to %s", user.email)
            except Exception as exc:  # one user's failure never stops the rest
                logger.warning("Proactive check failed for %s: %s", user.email, exc)


async def proactive_loop() -> None:
    logger.info(
        "Proactive-notifications loop started (enabled=%s).",
        get_settings().proactive_enabled,
    )
    while True:
        # Refresh the Claude usage tile from the server's own Claude each cycle
        # (this is the loop that sends notifications).
        try:
            async with SessionFactory() as session:
                await usage_service.refresh_from_bridge(session)
        except Exception as exc:  # never let the loop die
            logger.warning("Usage refresh tick failed: %s", exc)
        try:
            await check_proactive()
        except Exception as exc:  # never let the loop die
            logger.warning("Proactive tick failed: %s", exc)
        await asyncio.sleep(max(60, get_settings().proactive_interval_minutes * 60))
