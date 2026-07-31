"""Aggregate router for versioned feature resources.

`app.main` mounts this under the API prefix (e.g. `/api/v1`). Health checks
are intentionally *not* here — they live at the root (see `app.main`) because
infra probes expect `/health`, not a versioned path. Add feature routers
(assignments, tasks, notes, ...) here as Phase 3 lands them.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.routes import (
    admin,
    assistant,
    auth,
    calendar,
    eclass,
    grocery,
    prefs,
    rip,
    scripts,
    tasks,
    usage,
    vaults,
    weather,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(admin.router)
api_router.include_router(grocery.router)
api_router.include_router(prefs.router)
api_router.include_router(eclass.router)
api_router.include_router(calendar.router)
api_router.include_router(scripts.router)
api_router.include_router(rip.router)
api_router.include_router(tasks.router)
api_router.include_router(vaults.router)
api_router.include_router(assistant.router)
api_router.include_router(usage.router)
api_router.include_router(weather.router)
