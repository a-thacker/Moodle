"""DVD ripper endpoints.

Browser side (needs the `rip` capability):
    POST   /rip/jobs        enqueue a rip -> RipJob (pending)
    GET    /rip/jobs        recent jobs (status + streamed progress), newest first
    DELETE /rip/jobs        clear finished jobs

Host runner side (X-API-Key):
    GET  /rip/queue                 claim pending jobs (marks them running)
    POST /rip/jobs/{id}/progress    append streamed stdout
    POST /rip/jobs/{id}/result      post the final result

Nothing rips in the backend — see app.services.rip and the host
~/cc-agent/rip-runner.py.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_agent_key, require_capability
from app.db.session import get_db
from app.models.user import User
from app.schemas.rip import RipJobOut, RipProgress, RipRequest, RipResult
from app.services import rip as rip_service

router = APIRouter(prefix="/rip", tags=["rip"])

require_rip = require_capability("rip")


# --- Browser (rip capability) -------------------------------------------
@router.post("/jobs", response_model=RipJobOut, status_code=status.HTTP_201_CREATED)
async def create_job(
    payload: RipRequest,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(require_rip),
) -> RipJobOut:
    job = await rip_service.create_job(session, user.id, payload.title, payload.extras)
    return RipJobOut.model_validate(job)


@router.get("/jobs", response_model=list[RipJobOut], dependencies=[Depends(require_rip)])
async def jobs(session: AsyncSession = Depends(get_db)) -> list[RipJobOut]:
    return [RipJobOut.model_validate(j) for j in await rip_service.list_jobs(session)]


@router.delete("/jobs", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_rip)])
async def clear_jobs(session: AsyncSession = Depends(get_db)) -> None:
    await rip_service.clear_finished_jobs(session)


# --- Host runner (agent key) --------------------------------------------
@router.get("/queue", response_model=list[RipJobOut], dependencies=[Depends(require_agent_key)])
async def queue(session: AsyncSession = Depends(get_db)) -> list[RipJobOut]:
    return [RipJobOut.model_validate(j) for j in await rip_service.claim_pending(session)]


@router.post(
    "/jobs/{job_id}/progress",
    response_model=RipJobOut,
    dependencies=[Depends(require_agent_key)],
)
async def post_progress(
    job_id: int, payload: RipProgress, session: AsyncSession = Depends(get_db)
) -> RipJobOut:
    job = await rip_service.append_progress(session, job_id, payload.chunk)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown job")
    return RipJobOut.model_validate(job)


@router.post(
    "/jobs/{job_id}/result",
    response_model=RipJobOut,
    dependencies=[Depends(require_agent_key)],
)
async def post_result(
    job_id: int, payload: RipResult, session: AsyncSession = Depends(get_db)
) -> RipJobOut:
    job = await rip_service.complete_job(session, job_id, payload.exit_code, payload.progress)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown job")
    return RipJobOut.model_validate(job)
