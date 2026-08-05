"""Project logic — per-user CRUD plus derived task-progress counts.

Membership lives on `tasks.project_id`; progress is `done / total` of the
project's tasks, computed here so the read model is self-contained. All queries
are scoped to a user_id.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project
from app.models.task import Task
from app.schemas.project import ProjectCreate, ProjectRead, ProjectUpdate

_DONE = func.sum(case((Task.done.is_(True), 1), else_=0))


async def _counts(session: AsyncSession, user_id: uuid.UUID, project_id: int) -> tuple[int, int]:
    row = (
        await session.execute(
            select(func.count(), _DONE).where(
                Task.user_id == user_id, Task.project_id == project_id
            )
        )
    ).one()
    return int(row[0] or 0), int(row[1] or 0)


async def _to_read(session: AsyncSession, project: Project) -> ProjectRead:
    total, done = await _counts(session, project.user_id, project.id)
    return ProjectRead.model_validate(project).model_copy(
        update={"task_count": total, "done_count": done}
    )


async def list_projects(session: AsyncSession, user_id: uuid.UUID) -> list[ProjectRead]:
    projects = (
        await session.execute(
            select(Project)
            .where(Project.user_id == user_id)
            .order_by(Project.position.asc(), Project.created_at.desc())
        )
    ).scalars().all()

    counts: dict[int, tuple[int, int]] = {}
    rows = await session.execute(
        select(Task.project_id, func.count(), _DONE)
        .where(Task.user_id == user_id, Task.project_id.is_not(None))
        .group_by(Task.project_id)
    )
    for pid, total, done in rows.all():
        counts[int(pid)] = (int(total or 0), int(done or 0))

    result: list[ProjectRead] = []
    for p in projects:
        total, done = counts.get(p.id, (0, 0))
        result.append(
            ProjectRead.model_validate(p).model_copy(
                update={"task_count": total, "done_count": done}
            )
        )
    return result


async def get_project(
    session: AsyncSession, user_id: uuid.UUID, project_id: int
) -> Project | None:
    project = await session.get(Project, project_id)
    if project is None or project.user_id != user_id:
        return None
    return project


async def create_project(
    session: AsyncSession, user_id: uuid.UUID, data: ProjectCreate
) -> ProjectRead:
    max_pos = await session.scalar(
        select(func.coalesce(func.max(Project.position), 0.0)).where(Project.user_id == user_id)
    )
    project = Project(
        user_id=user_id,
        name=data.name.strip()[:200],
        description=data.description,
        color=(data.color.strip()[:20] if data.color else None),
        position=(max_pos or 0.0) + 1.0,
    )
    session.add(project)
    await session.commit()
    await session.refresh(project)
    return await _to_read(session, project)


async def update_project(
    session: AsyncSession, project: Project, data: ProjectUpdate
) -> ProjectRead:
    fields = data.model_dump(exclude_unset=True)
    if "name" in fields and fields["name"]:
        project.name = str(fields["name"]).strip()[:200]
    if "description" in fields:
        project.description = fields["description"]
    if "color" in fields:
        project.color = str(fields["color"]).strip()[:20] if fields["color"] else None
    if "status" in fields and fields["status"]:
        project.status = fields["status"]
        project.done_at = datetime.now() if fields["status"] == "done" else None
    if "position" in fields and fields["position"] is not None:
        project.position = fields["position"]
    await session.commit()
    await session.refresh(project)
    return await _to_read(session, project)


async def delete_project(session: AsyncSession, project: Project) -> None:
    # Tasks survive: their project_id resets to NULL via the FK (ON DELETE SET NULL).
    await session.delete(project)
    await session.commit()
