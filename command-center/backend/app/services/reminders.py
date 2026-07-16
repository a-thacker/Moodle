"""Event reminders over ntfy.

A background loop checks timed tasks due today and pushes a phone
notification shortly before each event, and a nudge after it starts if it's
still not checked off. `notified_before/after` flags on the task keep it to
one of each. Reminders are off unless NTFY_TOPIC is configured.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import select

from app.core.config import get_settings
from app.db.session import SessionFactory
from app.models.task import Task
from app.models.user import User

logger = logging.getLogger(__name__)

_TICK_SECONDS = 60


async def _send(topic: str, server: str, title: str, message: str) -> None:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            f"{server.rstrip('/')}/{topic}",
            content=message.encode("utf-8"),
            headers={"Title": title},
        )
        resp.raise_for_status()


async def check_reminders() -> None:
    settings = get_settings()
    tz = ZoneInfo(settings.timezone)
    now = datetime.now(tz)
    today = now.date()
    before = timedelta(minutes=settings.remind_before_minutes)
    after = timedelta(minutes=settings.remind_after_minutes)

    async with SessionFactory() as session:
        # Each user has their own private ntfy topic; a user with none gets no
        # reminders.
        rows = await session.execute(select(User.id, User.ntfy_topic))
        topic_by_user = {uid: topic for uid, topic in rows.all() if topic}
        if not topic_by_user:
            return

        result = await session.execute(
            select(Task).where(
                Task.due_date == today,
                Task.due_time.is_not(None),
                Task.done.is_(False),
            )
        )
        tasks = list(result.scalars().all())
        changed = False
        for t in tasks:
            topic = topic_by_user.get(t.user_id)
            if not topic:  # this task's owner has no reminder channel
                continue
            event = datetime.combine(today, t.due_time, tzinfo=tz)  # type: ignore[arg-type]
            when = t.due_time.strftime("%-I:%M %p")  # type: ignore[union-attr]
            if not t.notified_before and event - before <= now < event:
                try:
                    await _send(topic, settings.ntfy_server,
                                f"Soon: {t.title}", f"at {when}")
                    t.notified_before = True
                    changed = True
                except httpx.HTTPError as exc:
                    logger.warning("ntfy before-reminder failed: %s", exc)
            if not t.notified_after and now >= event + after:
                try:
                    await _send(topic, settings.ntfy_server,
                                f"Still open: {t.title}", f"was at {when} — not checked off")
                    t.notified_after = True
                    changed = True
                except httpx.HTTPError as exc:
                    logger.warning("ntfy after-reminder failed: %s", exc)
        if changed:
            await session.commit()


async def reminder_loop() -> None:
    logger.info("Reminder loop started (per-user ntfy topics via %s).",
                get_settings().ntfy_server)
    while True:
        try:
            await check_reminders()
        except Exception as exc:  # never let the loop die
            logger.warning("Reminder tick failed: %s", exc)
        await asyncio.sleep(_TICK_SECONDS)
