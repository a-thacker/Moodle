"""Application configuration.

All settings come from environment variables (a `.env` file in development,
real env vars in Docker). Pydantic validates and types them at startup, so a
misconfiguration fails fast and loudly instead of surfacing as a mysterious
runtime error. `get_settings()` is cached so the object is built once.
"""

from __future__ import annotations

from functools import lru_cache
from urllib.parse import quote

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

    # CORS: the frontend origins allowed to call this API. Stored as a raw
    # comma-separated string (e.g. "http://localhost:5173,https://cc.lan")
    # and split by `cors_origins_list`. Kept as `str` on purpose:
    # pydantic-settings would try to JSON-decode a `list` env value and fail
    # on a plain comma-separated string.
    cors_origins: str = "http://localhost:5173"

    # --- PostgreSQL ------------------------------------------------------
    postgres_host: str = "postgres"
    postgres_port: int = 5432
    postgres_user: str = "commandcenter"
    postgres_password: str = "changeme"
    postgres_db: str = "commandcenter"
    db_echo: bool = False  # log every SQL statement (noisy; dev only)

    @property
    def cors_origins_list(self) -> list[str]:
        """CORS origins as a list (splits the comma-separated setting)."""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def database_url(self) -> str:
        """Async SQLAlchemy URL (asyncpg driver) built from the parts.

        Username and password are percent-encoded so passwords containing URL
        metacharacters (@, %, :, /, ...) — as strong generated passwords do —
        produce a valid URL. SQLAlchemy decodes them back before connecting.
        """
        user = quote(self.postgres_user, safe="")
        password = quote(self.postgres_password, safe="")
        return (
            f"postgresql+asyncpg://{user}:{password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


@lru_cache
def get_settings() -> Settings:
    """Return the cached, validated Settings singleton."""
    return Settings()
