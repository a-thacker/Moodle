"""Agent configuration from environment variables (plus an optional .env).

Cloud credentials never live in code or git: the Supabase service-role key
and the ntfy topic come from the environment, or from a `.env` file in the
working directory (gitignored; see .env.example). A tiny KEY=VALUE parser
keeps this dependency-free — real environment variables always win over
the file.

Both integrations are optional: with nothing configured the agent still
runs fully local (snapshots + mac/console notifications), which keeps the
self-host migration path clean.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

DEFAULT_ENV_PATH = Path(".env")
DEFAULT_NTFY_SERVER = "https://ntfy.sh"


def load_env_file(path: Path | str = DEFAULT_ENV_PATH) -> None:
    """Load KEY=VALUE lines into os.environ (existing vars take precedence)."""
    try:
        lines = Path(path).read_text().splitlines()
    except FileNotFoundError:
        return
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


@dataclass
class AgentConfig:
    # Command Center self-hosted backend (the current target).
    cc_api_url: Optional[str] = None
    cc_api_key: Optional[str] = None
    # Supabase (the old Hub — kept as a fallback push target).
    supabase_url: Optional[str] = None
    supabase_service_role_key: Optional[str] = None
    ntfy_topic: Optional[str] = None
    ntfy_server: str = DEFAULT_NTFY_SERVER

    @classmethod
    def from_env(cls, env_path: Path | str = DEFAULT_ENV_PATH) -> "AgentConfig":
        load_env_file(env_path)
        return cls(
            cc_api_url=os.environ.get("CC_API_URL") or None,
            cc_api_key=os.environ.get("CC_API_KEY") or None,
            supabase_url=os.environ.get("SUPABASE_URL") or None,
            supabase_service_role_key=(
                os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or None
            ),
            ntfy_topic=os.environ.get("NTFY_TOPIC") or None,
            ntfy_server=os.environ.get(
                "NTFY_SERVER", DEFAULT_NTFY_SERVER
            ).rstrip("/"),
        )

    @property
    def backend_enabled(self) -> bool:
        return bool(self.cc_api_url and self.cc_api_key)

    @property
    def supabase_enabled(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_role_key)

    @property
    def ntfy_enabled(self) -> bool:
        return bool(self.ntfy_topic)
