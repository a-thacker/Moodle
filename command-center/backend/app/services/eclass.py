"""eClass data logic: agent ingest (upserts) and dashboard reads.

Read helpers shape rows into the frontend's view models — deriving a course
total from the newest snapshot and a human title/detail for each change.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.eclass import Course, GradeEvent, GradeSnapshot, TimelineEvent
from app.models.task import Task
from app.models.user import User
from app.schemas.eclass import (
    CourseIn,
    CourseRead,
    DeadlineRead,
    GradeEventIn,
    GradeEventRead,
    GradeSnapshotIn,
    TimelineEventIn,
)

_EMPTY = {None, "", "-", "–", "—"}


def _naive_local(dt: datetime) -> datetime:
    """Agent sends tz-aware due times; store naive local wall-clock so the
    date/time split matches how the user reads them."""
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(ZoneInfo(get_settings().timezone)).replace(tzinfo=None)


async def _owner(session: AsyncSession) -> User | None:
    return (
        await session.execute(
            select(User).where(User.role == "owner").order_by(User.created_at.asc()).limit(1)
        )
    ).scalar_one_or_none()


# --- Ingest --------------------------------------------------------------


async def upsert_courses(session: AsyncSession, courses: list[CourseIn]) -> int:
    for c in courses:
        existing = await session.get(Course, c.id)
        if existing is None:
            session.add(
                Course(id=c.id, short_name=c.short_name, full_name=c.full_name, hidden=c.hidden)
            )
        else:
            existing.short_name = c.short_name
            existing.full_name = c.full_name
            existing.hidden = c.hidden
    await session.commit()
    return len(courses)


async def add_snapshot(session: AsyncSession, snap: GradeSnapshotIn) -> None:
    session.add(GradeSnapshot(course_id=snap.course_id, report=snap.report))
    await session.commit()


async def add_grade_events(session: AsyncSession, events: list[GradeEventIn]) -> int:
    for e in events:
        session.add(GradeEvent(**e.model_dump()))
    await session.commit()
    return len(events)


async def replace_timeline(
    session: AsyncSession, events: list[TimelineEventIn]
) -> int:
    """Mirror "what's upcoming": upsert the given events, drop the rest."""
    keep_ids = [e.id for e in events]
    for e in events:
        existing = await session.get(TimelineEvent, e.id)
        if existing is None:
            session.add(TimelineEvent(**e.model_dump()))
        else:
            for field, value in e.model_dump().items():
                setattr(existing, field, value)
    stmt = delete(TimelineEvent)
    if keep_ids:
        stmt = stmt.where(TimelineEvent.id.notin_(keep_ids))
    await session.execute(stmt)
    await session.commit()
    return len(events)


async def replace_eclass_assignments(
    session: AsyncSession, events: list[TimelineEventIn]
) -> int:
    """Mirror the eClass timeline into the owner's tasks as checkable,
    nagging-until-done items (kind=task, source=eclass), deduped by the Moodle
    event id. The user's done-state and edits are preserved; nothing is pruned
    (a past assignment simply stops updating, so completed tasks never vanish)."""
    owner = await _owner(session)
    if owner is None:
        return 0

    existing = {
        t.external_id: t
        for t in (
            await session.execute(
                select(Task).where(Task.user_id == owner.id, Task.source == "eclass")
            )
        ).scalars().all()
    }

    for e in events:
        ext = str(e.id)
        due = _naive_local(e.due)
        row = existing.get(ext)
        if row is None:
            session.add(
                Task(
                    user_id=owner.id,
                    title=e.name,
                    kind="task",
                    source="eclass",
                    external_id=ext,
                    due_date=due.date(),
                    due_time=due.time(),
                    category="school",
                )
            )
        else:
            # Reset notification flags only if the deadline actually moved;
            # never touch done/done_at (the user owns completion).
            if row.due_date != due.date() or row.due_time != due.time():
                row.notified_at_time = False
                row.last_nudge_date = None
            row.title = e.name
            row.due_date = due.date()
            row.due_time = due.time()
    await session.commit()
    return len(events)


# --- Reads ---------------------------------------------------------------


def _course_total(report: dict[str, Any]) -> float | None:
    """Course total percentage from the last is_total item of a snapshot."""
    totals = [i for i in report.get("items", []) if i.get("is_total")]
    if not totals:
        return None
    pct = totals[-1].get("percentage")
    if pct in _EMPTY or pct is None:
        return None
    try:
        return float(str(pct).replace("%", "").replace(",", "").strip())
    except ValueError:
        return None


async def list_courses(session: AsyncSession) -> list[CourseRead]:
    courses = (
        (await session.execute(select(Course).where(Course.hidden.is_(False))))
        .scalars()
        .all()
    )
    result: list[CourseRead] = []
    for course in courses:
        latest = (
            await session.execute(
                select(GradeSnapshot)
                .where(GradeSnapshot.course_id == course.id)
                .order_by(GradeSnapshot.fetched_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        result.append(
            CourseRead(
                id=course.id,
                short_name=course.short_name,
                full_name=course.full_name,
                total_percent=_course_total(latest.report) if latest else None,
            )
        )
    return result


def _event_title_detail(event: GradeEvent) -> tuple[str, str | None]:
    if event.kind == "feedback":
        return f"{event.item_name}: new feedback", event.new
    if event.old:
        return f"{event.item_name}: {event.old} → {event.new}", event.category
    return f"{event.item_name} → {event.new}", event.category


async def recent_grade_events(
    session: AsyncSession, limit: int = 12
) -> list[GradeEventRead]:
    events = (
        (
            await session.execute(
                select(GradeEvent).order_by(GradeEvent.detected_at.desc()).limit(limit)
            )
        )
        .scalars()
        .all()
    )
    out: list[GradeEventRead] = []
    for e in events:
        title, detail = _event_title_detail(e)
        out.append(GradeEventRead(id=e.id, kind=e.kind, title=title, detail=detail))
    return out


async def list_deadlines(session: AsyncSession, limit: int = 15) -> list[DeadlineRead]:
    events = (
        (
            await session.execute(
                select(TimelineEvent).order_by(TimelineEvent.due.asc()).limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return [
        DeadlineRead(
            id=e.id,
            title=e.name,
            course_name=e.course_name or "eClass",
            module=e.module or "other",
            due=e.due,
            overdue=e.overdue,
        )
        for e in events
    ]
