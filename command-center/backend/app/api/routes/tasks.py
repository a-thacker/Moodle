"""Task endpoints (per-user).

    GET    /tasks         the current user's tasks
    POST   /tasks         create (quick capture)
    PATCH  /tasks/{id}    update (toggle done, edit, set due date)
    DELETE /tasks/{id}

Any authenticated user; every task is scoped to its owner.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.task import TaskCreate, TaskRead, TaskUpdate
from app.services import task as task_service

router = APIRouter(
    prefix="/tasks", tags=["tasks"], dependencies=[Depends(get_current_user)]
)


@router.get("", response_model=list[TaskRead])
async def list_tasks(
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TaskRead]:
    tasks = await task_service.list_tasks(session, user.id)
    return [TaskRead.model_validate(t) for t in tasks]


@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
async def create_task(
    payload: TaskCreate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TaskRead:
    task = await task_service.create_task(session, user.id, payload)
    return TaskRead.model_validate(task)


@router.patch("/{task_id}", response_model=TaskRead)
async def update_task(
    task_id: int,
    payload: TaskUpdate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TaskRead:
    task = await task_service.get_task(session, user.id, task_id)
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    updated = await task_service.update_task(session, task, payload)
    return TaskRead.model_validate(updated)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: int,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    task = await task_service.get_task(session, user.id, task_id)
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    await task_service.delete_task(session, task)
