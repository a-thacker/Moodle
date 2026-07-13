"""Application configuration.

All settings come from environment variables (a `.env` file in development,
real env vars in Docker). Pydantic validates and types them at startup, so a
misconfiguration fails fast and loudly instead of surfacing as a mysterious
runtime error. `get_settings()` is cached so the object is built once.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import PostgresDsn, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- Application -----------------------------------------------------
    app_name: str = "Command Center"
    environment: str = "development"  # development | production
    debug: bool = False
    log_level: str = "INFO"
    api_v1_prefix: str = "/api/v1"

    # CORS: the frontend origins allowed to call this API. Comma-separated
    # in the env (e.g. "http://localhost:5173,https://cc.example.com").
    cors_origins: list[str] = ["http://localhost:5173"]

    # --- PostgreSQL ------------------------------------------------------
    postgres_host: str = "postgres"
    postgres_port: int = 5432
    postgres_user: str = "commandcenter"
    postgres_password: str = "changeme"
    postgres_db: str = "commandcenter"
    db_echo: bool = False  # log every SQL statement (noisy; dev only)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def database_url(self) -> PostgresDsn:
        """Async SQLAlchemy URL (asyncpg driver) built from the parts."""
        return PostgresDsn.build(
            scheme="postgresql+asyncpg",
            username=self.postgres_user,
            password=self.postgres_password,
            host=self.postgres_host,
            port=self.postgres_port,
            path=self.postgres_db,
        )


@lru_cache
def get_settings() -> Settings:
    """Return the cached, validated Settings singleton."""
    return Settings()
