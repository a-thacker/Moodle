"""Task logic. All queries are scoped to a user_id — a user only ever sees
and edits their own tasks."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project
from app.models.task import Task
from app.schemas.task import TaskCreate, TaskUpdate


async def _owned_project_id(
    session: AsyncSession, user_id: uuid.UUID, project_id: int | None
) -> int | None:
    """Resolve a task's project: keep it only if the project exists and belongs
    to this user; None/negative clears it. Prevents filing a task under someone
    else's project id."""
    if project_id is None or project_id < 0:
        return None
    project = await session.get(Project, project_id)
    return project_id if (project is not None and project.user_id == user_id) else None


async def list_tasks(session: AsyncSession, user_id: uuid.UUID) -> list[Task]:
    result = await session.execute(
        select(Task)
        .where(Task.user_id == user_id)
        .order_by(Task.done.asc(), Task.position.asc(), Task.created_at.desc())
    )
    return list(result.scalars().all())


async def get_task(
    session: AsyncSession, user_id: uuid.UUID, task_id: int
) -> Task | None:
    task = await session.get(Task, task_id)
    if task is None or task.user_id != user_id:
        return None
    return task


async def create_task(
    session: AsyncSession, user_id: uuid.UUID, data: TaskCreate
) -> Task:
    max_pos = await session.scalar(
        select(func.coalesce(func.max(Task.position), 0.0)).where(Task.user_id == user_id)
    )
    task = Task(
        user_id=user_id,
        title=data.title.strip(),
        body=data.body,
        kind=data.kind,
        due_date=data.due_date,
        due_time=data.due_time,
        category=data.category,
        project_id=await _owned_project_id(session, user_id, data.project_id),
        position=(max_pos or 0.0) + 1.0,
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)
    return task


async def update_task(
    session: AsyncSession, task: Task, data: TaskUpdate
) -> Task:
    fields = data.model_dump(exclude_unset=True)
    if "title" in fields and fields["title"] is not None:
        task.title = fields["title"].strip()
    if "body" in fields:
        task.body = fields["body"]
    if "due_date" in fields:
        task.due_date = fields["due_date"]
        task.notified_at_time = False
        task.last_nudge_date = None
    if "due_time" in fields:
        task.due_time = fields["due_time"]
        task.notified_at_time = False
        task.last_nudge_date = None
    if "category" in fields:
        task.category = fields["category"]
    if "kind" in fields and fields["kind"]:
        task.kind = fields["kind"]
    if "project_id" in fields:
        task.project_id = await _owned_project_id(session, task.user_id, fields["project_id"])
    if "position" in fields and fields["position"] is not None:
        task.position = fields["position"]
    if "done" in fields and fields["done"] is not None:
        task.done = fields["done"]
        task.done_at = datetime.now() if fields["done"] else None
    await session.commit()
    await session.refresh(task)
    return task


async def delete_task(session: AsyncSession, task: Task) -> None:
    await session.delete(task)
    await session.commit()
