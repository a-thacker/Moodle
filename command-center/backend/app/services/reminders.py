"""Task & reminder notifications over ntfy.

A background loop (every minute) drives the three-type model:

- a **task** that is due-or-overdue and not checked off gets a "still open"
  nudge once each morning (at `remind_hour`) until it's done, plus a one-shot
  "it's due now" ping at its exact time if it has one.
- a **reminder** fires exactly once — at its time (timed) or on its day
  (date-only) — then never notifies again, though it stays as a checkable item.

`notified_at_time` gates the one-shot ping; `last_nudge_date` gates the daily
task nudge (once per day). Both reset when the due date/time changes. Off for
any user without an ntfy topic.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import select

from app.core.config import get_settings
from app.db.session import SessionFactory
from app.models.task import Task
from app.models.user import User
from app.services import ntfy

logger = logging.getLogger(__name__)

_TICK_SECONDS = 60


async def check_reminders() -> None:
    settings = get_settings()
    tz = ZoneInfo(settings.timezone)
    now = datetime.now(tz)
    today = now.date()
    hour = settings.remind_hour

    async with SessionFactory() as session:
        rows = await session.execute(select(User.id, User.ntfy_topic))
        topic_by_user = {uid: topic for uid, topic in rows.all() if topic}
        if not topic_by_user:
            return

        # Everything that could need a notification today: not done, dated, and
        # due today or overdue. (Future-dated items fire on their own day.)
        result = await session.execute(
            select(Task).where(
                Task.done.is_(False),
                Task.due_date.is_not(None),
                Task.due_date <= today,
            )
        )
        changed = False
        for t in result.scalars().all():
            topic = topic_by_user.get(t.user_id)
            if not topic:
                continue
            timed = t.due_time is not None
            when = t.due_time.strftime("%-I:%M %p") if timed else None

            # 1) One-shot "it's due now" ping for a timed item (task or reminder).
            if timed and not t.notified_at_time:
                moment = datetime.combine(t.due_date, t.due_time, tzinfo=tz)  # type: ignore[arg-type]
                if now >= moment:
                    if await _send(topic, settings, f"Now: {t.title}", f"scheduled for {when}"):
                        t.notified_at_time = True
                        changed = True

            # 2) Daily nudge, at/after the morning hour, at most once per day.
            due_this_morning = now.hour >= hour and (t.last_nudge_date is None or t.last_nudge_date < today)
            if due_this_morning:
                if t.kind == "reminder":
                    # Date-only reminder: fire once on (or after) its day, then never again.
                    if not timed and not t.notified_at_time:
                        if await _send(topic, settings, f"Reminder: {t.title}", when or ""):
                            t.notified_at_time = True
                            t.last_nudge_date = today
                            changed = True
                else:  # task — repeats each morning until checked off
                    overdue = t.due_date < today
                    label = "Overdue" if overdue else "Due today"
                    detail = f"at {when}" if when else "still open — check it off when done"
                    if await _send(topic, settings, f"{label}: {t.title}", detail):
                        t.last_nudge_date = today
                        changed = True

        if changed:
            await session.commit()


async def _send(topic: str, settings, title: str, body: str) -> bool:
    """Send one ntfy message; a failure warns but doesn't abort the tick."""
    try:
        await ntfy.send(topic, settings.ntfy_server, title, body)
        return True
    except httpx.HTTPError as exc:
        logger.warning("ntfy send failed (%s): %s", title, exc)
        return False


async def reminder_loop() -> None:
    logger.info("Reminder loop started (per-user ntfy topics via %s).",
                get_settings().ntfy_server)
    while True:
        try:
            await check_reminders()
        except Exception as exc:  # never let the loop die
            logger.warning("Reminder tick failed: %s", exc)
        await asyncio.sleep(_TICK_SECONDS)
