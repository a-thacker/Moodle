"""Async database engine, session factory, and the request-scoped session
dependency.

One engine and one sessionmaker per process (module-level, not global mutable
state — they're immutable handles). `get_db` yields a session per request and
guarantees it is closed; routes never construct sessions themselves.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings

settings = get_settings()

engine: AsyncEngine = create_async_engine(
    str(settings.database_url),
    echo=settings.db_echo,
    pool_pre_ping=True,  # transparently recycle stale connections
)

SessionFactory: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: yield a session, always closing it afterwards."""
    async with SessionFactory() as session:
        yield session
