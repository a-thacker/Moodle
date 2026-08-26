"""Task notifications over ntfy — silent by default.

The old model nagged every open task every morning forever; every eClass
assignment was one of those, so the phone drowned. This one flips it: a task is
a quiet checklist item unless *you* opt it in.

What can fire, per user (topic required), in the configured timezone:

- **Timed alert** — a task with `alert` on and an `alert_time` set fires **once**
  at that time (on its due date, else today). Gated by `notified_at_time`.
- **Morning digest** — at `remind_hour`, one push summarizing what's actually
  worth seeing: tasks due today, any open `alert` task, and ⭐ `important` tasks
  that have slipped overdue. Skipped silently if that list is empty.
- **Midday & evening re-pings** — at 1 PM / 6 PM, one push listing open `alert`
  tasks that have *no* set time (the "don't let me forget" pile), until checked
  off.

The three scheduled slots are gated per user by `users.slot_at` (one send per
slot per day). Everything is off for a user without an ntfy topic.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, time as dtime
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
_MIDDAY_HOUR = 13
_EVENING_HOUR = 18


def _fmt(t: dtime) -> str:
    return t.strftime("%-I:%M %p")


def _digest_tasks(tasks: list[Task], today) -> list[Task]:
    """The morning digest's contents: due today, opted-in (alert), or an
    ⭐ important item that's now overdue. Deduped, timed items first."""
    picked: dict[int, Task] = {}
    for t in tasks:
        due_today = t.due_date == today
        important_overdue = t.important and t.due_date is not None and t.due_date < today
        if due_today or t.alert or important_overdue:
            picked[t.id] = t
    return sorted(picked.values(), key=lambda t: (t.due_time is None, t.due_time or dtime.min))


def _lines(tasks: list[Task]) -> str:
    out = []
    for t in tasks:
        prefix = f"{_fmt(t.due_time)}  " if t.due_time else ""
        out.append(f"• {prefix}{t.title}")
    return "\n".join(out)


async def check_reminders() -> None:
    settings = get_settings()
    tz = ZoneInfo(settings.timezone)
    # Naive local wall-clock — matches how due dates/times and slot_at are stored
    # (the DB columns are TIMESTAMP WITHOUT TIME ZONE). Comparing/storing an
    # aware datetime against those raises, so drop the tzinfo up front.
    now = datetime.now(tz).replace(tzinfo=None)
    today = now.date()

    # The scheduled slot (if any) whose hour has passed this tick.
    slot_hours = sorted({settings.remind_hour, _MIDDAY_HOUR, _EVENING_HOUR})
    passed = [h for h in slot_hours if now.hour >= h]
    slot_hour = passed[-1] if passed else None

    async with SessionFactory() as session:
        users = (
            await session.execute(select(User).where(User.ntfy_topic.is_not(None)))
        ).scalars().all()
        if not users:
            return

        changed = False
        for user in users:
            topic = user.ntfy_topic
            if not topic:
                continue
            tasks = list(
                (
                    await session.execute(
                        select(Task).where(Task.user_id == user.id, Task.done.is_(False))
                    )
                ).scalars().all()
            )

            # 1) One-shot timed alerts — fire once at the task's alert_time.
            for t in tasks:
                if t.alert and t.alert_time is not None and not t.notified_at_time:
                    moment = datetime.combine(t.due_date or today, t.alert_time)
                    if now >= moment and await _send(topic, settings, t.title, f"⏰ {_fmt(t.alert_time)}"):
                        t.notified_at_time = True
                        changed = True

            # 2) The morning digest / midday-evening re-pings — one per slot/day.
            if slot_hour is None:
                continue
            slot_dt = datetime.combine(today, dtime(hour=slot_hour))
            if user.slot_at is not None and user.slot_at >= slot_dt:
                continue  # this slot already sent today

            sent_ok = True
            if slot_hour == settings.remind_hour:  # morning digest
                digest = _digest_tasks(tasks, today)
                if digest:
                    n = len(digest)
                    title = f"Today · {n} item{'' if n == 1 else 's'}"
                    sent_ok = await _send(topic, settings, title, _lines(digest))
            else:  # midday / evening — only the no-time "don't forget" pile
                flagged = [t for t in tasks if t.alert and t.alert_time is None]
                if flagged:
                    sent_ok = await _send(topic, settings, "Don't forget", _lines(flagged))

            if sent_ok:  # advance even when there was nothing to send (slot consumed)
                user.slot_at = now
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
    logger.info("Reminder loop started (silent-by-default; per-user ntfy topics via %s).",
                get_settings().ntfy_server)
    while True:
        try:
            await check_reminders()
        except Exception as exc:  # never let the loop die
            logger.warning("Reminder tick failed: %s", exc)
        await asyncio.sleep(_TICK_SECONDS)
