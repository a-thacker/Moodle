"""Aggregate router for versioned feature resources.

`app.main` mounts this under the API prefix (e.g. `/api/v1`). Health checks
are intentionally *not* here — they live at the root (see `app.main`) because
infra probes expect `/health`, not a versioned path. Add feature routers
(assignments, tasks, notes, ...) here as Phase 3 lands them.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.routes import grocery

api_router = APIRouter()
api_router.include_router(grocery.router)

# More feature routers get included here as Phase 3 lands them, e.g.:
#   from app.api.routes import assignments
#   api_router.include_router(assignments.router)
