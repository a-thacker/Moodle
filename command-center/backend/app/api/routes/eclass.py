"""eClass endpoints.

Ingest (agent, X-API-Key):
    PUT  /ingest/courses
    POST /ingest/grade-snapshots
    POST /ingest/grade-events
    PUT  /ingest/timeline

Read (owner JWT — mirrors the old Supabase RLS: eClass data is owner-only):
    GET  /courses
    GET  /grade-events
    GET  /deadlines
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_agent_key, require_owner
from app.db.session import get_db
from app.schemas.eclass import (
    CourseIn,
    CourseRead,
    DeadlineRead,
    GradeEventIn,
    GradeEventRead,
    GradeSnapshotIn,
    TimelineEventIn,
)
from app.services import eclass as eclass_service

router = APIRouter(tags=["eclass"])

# --- Ingest (machine-to-machine) ----------------------------------------
ingest = APIRouter(prefix="/ingest", dependencies=[Depends(require_agent_key)])


@ingest.put("/courses")
async def ingest_courses(
    courses: list[CourseIn], session: AsyncSession = Depends(get_db)
) -> dict[str, int]:
    return {"upserted": await eclass_service.upsert_courses(session, courses)}


@ingest.post("/grade-snapshots", status_code=201)
async def ingest_snapshot(
    snapshot: GradeSnapshotIn, session: AsyncSession = Depends(get_db)
) -> dict[str, str]:
    await eclass_service.add_snapshot(session, snapshot)
    return {"status": "ok"}


@ingest.post("/grade-events", status_code=201)
async def ingest_grade_events(
    events: list[GradeEventIn], session: AsyncSession = Depends(get_db)
) -> dict[str, int]:
    return {"inserted": await eclass_service.add_grade_events(session, events)}


@ingest.put("/timeline")
async def ingest_timeline(
    events: list[TimelineEventIn], session: AsyncSession = Depends(get_db)
) -> dict[str, int]:
    return {"synced": await eclass_service.replace_timeline(session, events)}


# --- Reads (owner only) --------------------------------------------------
reads = APIRouter(dependencies=[Depends(require_owner)])


@reads.get("/courses", response_model=list[CourseRead])
async def get_courses(session: AsyncSession = Depends(get_db)) -> list[CourseRead]:
    return await eclass_service.list_courses(session)


@reads.get("/grade-events", response_model=list[GradeEventRead])
async def get_grade_events(
    session: AsyncSession = Depends(get_db),
) -> list[GradeEventRead]:
    return await eclass_service.recent_grade_events(session)


@reads.get("/deadlines", response_model=list[DeadlineRead])
async def get_deadlines(session: AsyncSession = Depends(get_db)) -> list[DeadlineRead]:
    return await eclass_service.list_deadlines(session)


router.include_router(ingest)
router.include_router(reads)
