"""Alembic migration environment (async).

The URL and target metadata are taken from the application itself — the same
`Settings` the app uses and the same `Base.metadata` the models register on —
so migrations can never drift from runtime configuration. Importing
`app.models` ensures every table is registered before autogenerate runs.
"""

from __future__ import annotations

import asyncio
from logging.config import fileConfig

from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import context

from app.core.config import get_settings
from app.db.base import Base
import app.models  # noqa: F401  (registers all models on Base.metadata)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# The URL comes straight from app settings — never through Alembic's config
# parser, whose ConfigParser interpolation would choke on the '%' characters
# in a percent-encoded password. One source of truth, no escaping games.
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Emit SQL to a script without a live DBAPI connection."""
    context.configure(
        url=get_settings().database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """Run migrations against a live async engine built from app settings."""
    connectable = create_async_engine(get_settings().database_url)
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
