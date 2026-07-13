"""Health-check endpoints.

- `GET /health`    — liveness: the process is up. No dependencies touched, so
  it's safe for a container/orchestrator restart probe.
- `GET /health/db` — readiness: the database is reachable. Returns 503 when
  it isn't, so a load balancer can drain the instance.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app import __version__
from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.schemas.health import DatabaseHealth, HealthStatus
from app.services import health as health_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthStatus)
async def liveness(settings: Settings = Depends(get_settings)) -> HealthStatus:
    return HealthStatus(
        app=settings.app_name,
        version=__version__,
        environment=settings.environment,
    )


@router.get("/health/db", response_model=DatabaseHealth)
async def readiness(session: AsyncSession = Depends(get_db)) -> JSONResponse:
    try:
        await health_service.check_database(session)
    except Exception as exc:
        # Readiness: any failure — a wrapped SQLAlchemy error or a raw
        # OSError from the driver when Postgres is unreachable — means
        # "not ready". Report 503 rather than leaking a 500.
        logger.warning("Database health check failed: %s", exc)
        payload = DatabaseHealth(database="error", detail="unreachable")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=payload.model_dump(),
        )
    return JSONResponse(content=DatabaseHealth(database="ok").model_dump())
