"""Laptop script runner — a queue between the browser and Alden's Mac.

The backend never executes anything here: it only stores jobs and the Mac's
reported registry. A poller on the Mac (see agent/scripts_runner.py) claims
queued jobs, runs the matching executable from ~/cc-scripts/, and posts the
output back. The route layer gates the browser side to the owner and the Mac
side to the shared agent API key.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.script import ScriptJob, ScriptRegistry

_MAX_OUTPUT = 100_000  # chars per stream, keep rows sane
_JOBS_LIMIT = 25


async def get_registry(session: AsyncSession) -> list[dict]:
    row = await session.get(ScriptRegistry, 1)
    return list(row.data) if row and row.data else []


async def set_registry(session: AsyncSession, scripts: list[dict]) -> None:
    row = await session.get(ScriptRegistry, 1)
    if row is None:
        session.add(ScriptRegistry(id=1, data=scripts))
    else:
        row.data = scripts
    await session.commit()


async def create_job(
    session: AsyncSession, user_id: uuid.UUID, script: str, args: str | None
) -> ScriptJob:
    job = ScriptJob(script=script, args=args or None, requested_by=user_id, status="pending")
    session.add(job)
    await session.commit()
    await session.refresh(job)
    return job


async def list_jobs(session: AsyncSession, limit: int = _JOBS_LIMIT) -> list[ScriptJob]:
    result = await session.execute(
        select(ScriptJob).order_by(ScriptJob.created_at.desc()).limit(limit)
    )
    return list(result.scalars().all())


async def clear_finished_jobs(session: AsyncSession) -> None:
    """Delete completed jobs (done/failed); leave pending/running alone so an
    in-flight run isn't orphaned from its result."""
    await session.execute(delete(ScriptJob).where(ScriptJob.status.in_(("done", "failed"))))
    await session.commit()


async def claim_pending(session: AsyncSession, limit: int = 10) -> list[ScriptJob]:
    """Return pending jobs and mark them running, so the poller never runs one
    twice. `skip_locked` keeps concurrent pollers from grabbing the same row."""
    result = await session.execute(
        select(ScriptJob)
        .where(ScriptJob.status == "pending")
        .order_by(ScriptJob.created_at.asc())
        .limit(limit)
        .with_for_update(skip_locked=True)
    )
    jobs = list(result.scalars().all())
    now = datetime.utcnow()
    for job in jobs:
        job.status = "running"
        job.started_at = now
    await session.commit()
    for job in jobs:
        await session.refresh(job)
    return jobs


async def complete_job(
    session: AsyncSession, job_id: int, exit_code: int | None, stdout: str, stderr: str
) -> ScriptJob | None:
    job = await session.get(ScriptJob, job_id)
    if job is None:
        return None
    job.exit_code = exit_code
    job.stdout = (stdout or "")[:_MAX_OUTPUT]
    job.stderr = (stderr or "")[:_MAX_OUTPUT]
    job.status = "done" if exit_code == 0 else "failed"
    job.finished_at = datetime.utcnow()
    await session.commit()
    await session.refresh(job)
    return job
