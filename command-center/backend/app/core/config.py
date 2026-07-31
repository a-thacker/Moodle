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
    # The user's local timezone — the container runs in UTC, so anything that
    # reasons about "now" or a wall-clock due time uses this instead.
    timezone: str = "America/New_York"

    # CORS: the frontend origins allowed to call this API. Stored as a raw
    # comma-separated string (e.g. "http://localhost:5173,https://cc.lan")
    # and split by `cors_origins_list`. Kept as `str` on purpose:
    # pydantic-settings would try to JSON-decode a `list` env value and fail
    # on a plain comma-separated string.
    cors_origins: str = "http://localhost:5173"

    # --- Auth ------------------------------------------------------------
    # Signing secret for JWTs (maps to JWT_SECRET in the environment).
    jwt_secret: str = "dev-insecure-change-me"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days (personal app)
    # Shared secret the local sync agent presents to write eClass data
    # (X-API-Key). Read endpoints use user JWTs instead.
    agent_api_key: str | None = None

    # One-time user seeding (read by scripts/seed_users.py).
    owner_email: str | None = None
    owner_password: str | None = None
    owner_name: str = "Alden"
    roommate_email: str | None = None
    roommate_password: str | None = None
    roommate_name: str = "Roommate"
    # Optional "sibling" account — a scaled-down experience (planner, grades,
    # AI). Leave unset to keep the whole feature dormant.
    sibling_email: str | None = None
    sibling_password: str | None = None
    sibling_name: str = "Sibling"

    # --- Assistant ------------------------------------------------------
    # Claude bridge (preferred): a tiny host service that runs headless
    # `claude -p` on Alden's subscription login. Free (counts against the
    # existing Claude quota, not the pay-as-you-go API) and it can act on the
    # dashboard through the `cc` CLI. When set it takes precedence over
    # Anthropic/Ollama. e.g. "http://host.docker.internal:8787".
    claude_bridge_url: str = ""
    # Ollama (local, free, slower on CPU).
    ollama_url: str = "http://ollama:11434"
    ollama_model: str = ""  # e.g. "gemma3:4b"; empty disables local model
    # Anthropic (Claude) API — smart + fast. When a key is set it takes
    # precedence over Ollama. Pay-as-you-go; the key lives only in the
    # server's .env.
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-haiku-4-5-20251001"
    # Codex bridge (preferred for the sibling): a host service running the
    # OpenAI `codex` CLI on his ChatGPT *subscription* (free — not the paid
    # API). Same shape as the Claude bridge. e.g. "http://host.docker.internal:8788".
    codex_bridge_url: str = ""
    # OpenAI API — fallback for the sibling if you have API credits instead of
    # (or as well as) the Codex bridge. Empty disables.
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_base_url: str = "https://api.openai.com/v1"

    # --- Weather (Open-Meteo — free, no API key) ------------------------
    weather_latitude: float = 35.0526   # Collegedale, TN
    weather_longitude: float = -85.0491
    weather_label: str = "Collegedale, TN"

    # --- Obsidian vault hub ---------------------------------------------
    # Git-backed Obsidian vaults are cloned/pulled into this directory (a Docker
    # volume, so clones survive redeploys). The backend reads markdown from here.
    vault_data_dir: str = "/vault-data"
    # Optional credential for private vault repos, applied to https remotes at
    # pull time (e.g. a GitHub PAT). Lives only in the server .env, never on the
    # row or in git. Empty = only public/ssh-key-reachable repos work.
    vault_git_token: str = ""
    # How often the background loop re-pulls every registered vault.
    vault_sync_interval_minutes: int = 15

    # --- Calendar (.ics feed import) ------------------------------------
    # How often the background loop re-fetches every enabled .ics calendar feed.
    calendar_sync_interval_minutes: int = 30

    # --- External service links (shown in the rail when granted) ---------
    # URLs are deployment-specific; a link tool is hidden until its URL is set.
    jellyfin_url: str = ""    # JELLYFIN_URL, e.g. http://athacker-cc:8096
    otterwiki_url: str = ""   # OTTERWIKI_URL, e.g. http://athacker-cc:8080

    # --- Notifications (ntfy) -------------------------------------------
    ntfy_topic: str = ""  # owner's topic (NTFY_TOPIC); empty disables his reminders
    sibling_ntfy_topic: str = ""  # sibling's own topic; empty disables his reminders
    ntfy_server: str = "https://ntfy.sh"
    # Notification icon shown by the ntfy app — the Command Center site favicon.
    # The ntfy app fetches + caches this URL (reachable on the tailnet); set
    # NTFY_ICON_URL to "" to disable, or to a public URL to always show.
    ntfy_icon_url: str = "https://athacker.cc/android-chrome-192x192.png"
    remind_before_minutes: int = 15  # notify this long before a timed event
    remind_after_minutes: int = 30   # nudge this long after, if not done

    # --- Proactive AI notifications -------------------------------------
    # A background loop asks each AI-enabled user's assistant whether to send a
    # timely nudge. OFF by default (it auto-messages phones) — enable per
    # deployment once you've previewed the output.
    proactive_enabled: bool = False
    proactive_interval_minutes: int = 60   # how often the loop wakes up
    proactive_cooldown_minutes: int = 180  # min gap between nudges per user
    proactive_dedup_hours: int = 24        # suppress identical nudges within this window

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
