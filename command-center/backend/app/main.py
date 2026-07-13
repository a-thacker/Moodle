"""FastAPI application factory.

`create_app()` wires configuration, logging, CORS, and the API router into an
app instance. Using a factory (rather than a module-level `app = FastAPI()`
with import-time side effects) keeps startup ordering explicit and makes the
app trivial to construct in tests.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.router import api_router
from app.api.routes import health
from app.core.config import get_settings
from app.core.logging import configure_logging

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown hooks. Migrations run in the container entrypoint,
    not here, so the app boot stays fast and side-effect-light."""
    settings = get_settings()
    logger.info(
        "Starting %s v%s (env=%s)",
        settings.app_name,
        __version__,
        settings.environment,
    )
    yield
    logger.info("Shutting down %s", settings.app_name)


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(
        title=settings.app_name,
        version=__version__,
        debug=settings.debug,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Health at the root (infra probes expect /health); feature resources
    # under the versioned API prefix.
    app.include_router(health.router)
    app.include_router(api_router, prefix=settings.api_v1_prefix)

    return app


app = create_app()
