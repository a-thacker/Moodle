"""Project endpoints (per-user).

    GET    /projects        the caller's projects (+ task-progress counts)
    POST   /projects        create
    PATCH  /projects/{id}    rename / recolor / status (active|done|archived)
    DELETE /projects/{id}    delete (its tasks survive, unfiled)

Any authenticated user; every project is scoped to its owner. Task membership
is set via the tasks API (`project_id` on create/patch).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectRead, ProjectUpdate
from app.services import project as project_service

router = APIRouter(
    prefix="/projects", tags=["projects"], dependencies=[Depends(get_current_user)]
)


@router.get("", response_model=list[ProjectRead])
async def list_projects(
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ProjectRead]:
    return await project_service.list_projects(session, user.id)


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProjectRead:
    return await project_service.create_project(session, user.id, payload)


@router.patch("/{project_id}", response_model=ProjectRead)
async def update_project(
    project_id: int,
    payload: ProjectUpdate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProjectRead:
    project = await project_service.get_project(session, user.id, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return await project_service.update_project(session, project, payload)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    project = await project_service.get_project(session, user.id, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    await project_service.delete_project(session, project)
