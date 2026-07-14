"""Laptop script-runner endpoints.

Browser side (owner JWT):
    GET  /scripts            list the scripts the Mac currently offers
    POST /scripts/run        enqueue a script  -> ScriptJob (pending)
    GET  /scripts/jobs       recent jobs (status + output), newest first

Mac poller side (X-API-Key):
    PUT  /scripts/registry           report available scripts
    GET  /scripts/queue              claim pending jobs (marks them running)
    POST /scripts/jobs/{id}/result   post a job's output

Nothing runs in the backend — see app.services.scripts and
agent/scripts_runner.py.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_agent_key, require_owner
from app.db.session import get_db
from app.models.user import User
from app.schemas.scripts import JobResult, RunRequest, ScriptInfo, ScriptJobOut
from app.services import scripts as scripts_service

router = APIRouter(prefix="/scripts", tags=["scripts"])


# --- Browser (owner) -----------------------------------------------------
@router.get("", response_model=list[ScriptInfo], dependencies=[Depends(require_owner)])
async def list_scripts(session: AsyncSession = Depends(get_db)) -> list[ScriptInfo]:
    return [ScriptInfo(**s) for s in await scripts_service.get_registry(session)]


@router.post("/run", response_model=ScriptJobOut, status_code=status.HTTP_201_CREATED)
async def run(
    payload: RunRequest,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(require_owner),
) -> ScriptJobOut:
    known = {s.get("id") for s in await scripts_service.get_registry(session)}
    if payload.script not in known:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown script (is the Mac runner online?)")
    job = await scripts_service.create_job(session, user.id, payload.script, payload.args)
    return ScriptJobOut.model_validate(job)


@router.get("/jobs", response_model=list[ScriptJobOut], dependencies=[Depends(require_owner)])
async def jobs(session: AsyncSession = Depends(get_db)) -> list[ScriptJobOut]:
    return [ScriptJobOut.model_validate(j) for j in await scripts_service.list_jobs(session)]


@router.delete("/jobs", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_owner)])
async def clear_jobs(session: AsyncSession = Depends(get_db)) -> None:
    await scripts_service.clear_finished_jobs(session)


# --- Mac poller (agent key) ---------------------------------------------
@router.put("/registry", dependencies=[Depends(require_agent_key)])
async def put_registry(
    payload: list[ScriptInfo], session: AsyncSession = Depends(get_db)
) -> dict[str, str]:
    await scripts_service.set_registry(session, [p.model_dump() for p in payload])
    return {"status": "ok"}


@router.get("/queue", response_model=list[ScriptJobOut], dependencies=[Depends(require_agent_key)])
async def queue(session: AsyncSession = Depends(get_db)) -> list[ScriptJobOut]:
    return [ScriptJobOut.model_validate(j) for j in await scripts_service.claim_pending(session)]


@router.post(
    "/jobs/{job_id}/result",
    response_model=ScriptJobOut,
    dependencies=[Depends(require_agent_key)],
)
async def post_result(
    job_id: int, payload: JobResult, session: AsyncSession = Depends(get_db)
) -> ScriptJobOut:
    job = await scripts_service.complete_job(
        session, job_id, payload.exit_code, payload.stdout, payload.stderr
    )
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown job")
    return ScriptJobOut.model_validate(job)
