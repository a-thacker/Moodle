"""Health-check business logic.

Kept out of the route so the route stays a thin HTTP adapter: it calls this,
this talks to the database. When readiness needs to check more than Postgres
(Ollama, disk, a queue), it grows here, not in the router.
"""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def check_database(session: AsyncSession) -> None:
    """Run a trivial query to confirm the database is reachable.

    Raises whatever SQLAlchemy raises on failure; the caller maps that to a
    response. Returns None on success.
    """
    await session.execute(text("SELECT 1"))
