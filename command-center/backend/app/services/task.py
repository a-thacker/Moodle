"""Task logic. All queries are scoped to a user_id — a user only ever sees
and edits their own tasks."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import Task
from app.schemas.task import TaskCreate, TaskUpdate


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
        due_date=data.due_date,
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
