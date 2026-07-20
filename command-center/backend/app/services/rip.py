"""DVD ripper queue — a queue between the browser and the server host.

The backend never rips: it stores jobs and the streamed output. A poller on the
host (`~/cc-agent/rip-runner.py`) claims queued jobs, runs the non-interactive
rip script (makemkvcon), streams progress back, and posts the final result. The
route layer gates the browser side to users with the `rip` capability and the
host side to the shared agent API key. Mirrors `app.services.scripts`.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.rip import RipJob

_MAX_OUTPUT = 200_000  # progress can be long (a full rip); keep rows bounded
_JOBS_LIMIT = 25
_VALID_EXTRAS = {"extras", "keep", "delete"}


async def create_job(
    session: AsyncSession, user_id: uuid.UUID, title: str, extras: str
) -> RipJob:
    job = RipJob(
        title=title.strip()[:300],
        media_type="movie",
        extras=extras if extras in _VALID_EXTRAS else "extras",
        requested_by=user_id,
        status="pending",
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)
    return job


async def list_jobs(session: AsyncSession, limit: int = _JOBS_LIMIT) -> list[RipJob]:
    result = await session.execute(
        select(RipJob).order_by(RipJob.created_at.desc()).limit(limit)
    )
    return list(result.scalars().all())


async def clear_finished_jobs(session: AsyncSession) -> None:
    """Delete completed jobs (done/failed); leave pending/running alone so an
    in-flight rip isn't orphaned from its result."""
    await session.execute(delete(RipJob).where(RipJob.status.in_(("done", "failed"))))
    await session.commit()


async def claim_pending(session: AsyncSession, limit: int = 1) -> list[RipJob]:
    """Return pending jobs and mark them running. Only one drive, so the runner
    claims one at a time; `skip_locked` keeps concurrent pollers safe."""
    result = await session.execute(
        select(RipJob)
        .where(RipJob.status == "pending")
        .order_by(RipJob.created_at.asc())
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


async def append_progress(session: AsyncSession, job_id: int, chunk: str) -> RipJob | None:
    """Append streamed stdout to a running job's progress (bounded)."""
    job = await session.get(RipJob, job_id)
    if job is None:
        return None
    combined = (job.progress or "") + (chunk or "")
    # Keep the tail if it grows past the cap — the recent lines matter most.
    job.progress = combined[-_MAX_OUTPUT:]
    await session.commit()
    await session.refresh(job)
    return job


async def complete_job(
    session: AsyncSession, job_id: int, exit_code: int | None, progress: str | None
) -> RipJob | None:
    job = await session.get(RipJob, job_id)
    if job is None:
        return None
    if progress is not None:
        job.progress = progress[-_MAX_OUTPUT:]
    job.exit_code = exit_code
    job.status = "done" if exit_code == 0 else "failed"
    job.finished_at = datetime.utcnow()
    await session.commit()
    await session.refresh(job)
    return job
