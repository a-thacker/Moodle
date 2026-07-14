"""Script/command runner endpoints (owner only).

    GET  /scripts       list the one-click scripts
    POST /scripts/run   run a registered script (script_id) or a command

Runs inside the backend container — see app.services.scripts. Owner-gated
because it is arbitrary code execution within that sandbox.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import require_owner
from app.schemas.scripts import RunRequest, RunResult, ScriptInfo
from app.services import scripts as scripts_service

router = APIRouter(
    prefix="/scripts", tags=["scripts"], dependencies=[Depends(require_owner)]
)


@router.get("", response_model=list[ScriptInfo])
async def list_scripts() -> list[ScriptInfo]:
    return [
        ScriptInfo(id=s.id, label=s.label, description=s.description)
        for s in scripts_service.REGISTRY
    ]


@router.post("/run", response_model=RunResult)
async def run(payload: RunRequest) -> RunResult:
    if payload.script_id:
        script = scripts_service.REGISTRY_BY_ID.get(payload.script_id)
        if script is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown script")
        command = script.command
    elif payload.command and payload.command.strip():
        command = payload.command
    else:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Provide script_id or command"
        )
    result = await scripts_service.run_command(command)
    return RunResult(**result)
