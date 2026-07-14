"""Aggregate router for versioned feature resources.

`app.main` mounts this under the API prefix (e.g. `/api/v1`). Health checks
are intentionally *not* here — they live at the root (see `app.main`) because
infra probes expect `/health`, not a versioned path. Add feature routers
(assignments, tasks, notes, ...) here as Phase 3 lands them.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.routes import auth, eclass, grocery

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(grocery.router)
api_router.include_router(eclass.router)
