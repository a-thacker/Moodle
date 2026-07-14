"""Script/command runner.

Runs a shell command inside the backend container and returns its output.
This is deliberately container-scoped: the process can do anything the
backend can (python, pip, alembic, the app code at /app) but cannot reach the
host OS or other containers. The route layer restricts this to the owner.

A small registry of predefined scripts powers one-click buttons; the free-form
command box uses `run_command` directly.
"""

from __future__ import annotations

import asyncio
import os
import time
from dataclasses import dataclass

_DEFAULT_TIMEOUT = 60.0
_MAX_OUTPUT = 100_000  # bytes per stream, to keep responses sane
# App root in the container; None (inherit) when running outside it (dev/test).
_CWD = "/app" if os.path.isdir("/app") else None


@dataclass(frozen=True)
class Script:
    id: str
    label: str
    description: str
    command: str


# One-click scripts. All safe, all run in the container. Extend freely.
REGISTRY: list[Script] = [
    Script("migrations", "Migration status", "Current Alembic revision", "alembic current -v"),
    Script("migration-history", "Migration history", "All migrations, newest first", "alembic history"),
    Script("seed-users", "Re-seed users", "Create/update users from env vars", "python -m scripts.seed_users"),
    Script("packages", "Installed packages", "pip list", "pip list"),
    Script("disk", "Disk usage", "df -h /", "df -h /"),
    Script("system", "System info", "Python + kernel", "python --version && uname -a"),
]
REGISTRY_BY_ID: dict[str, Script] = {s.id: s for s in REGISTRY}


async def run_command(command: str, timeout: float = _DEFAULT_TIMEOUT) -> dict:
    """Execute `command` via bash; capture stdout/stderr/exit code.

    Kills the process on timeout. Never raises for a non-zero exit — the exit
    code is part of the result.
    """
    started = time.perf_counter()
    proc = await asyncio.create_subprocess_exec(
        "/bin/bash",
        "-c",
        command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=_CWD,
    )
    timed_out = False
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        out, err = await proc.communicate()
        timed_out = True

    duration_ms = round((time.perf_counter() - started) * 1000)
    return {
        "command": command,
        "stdout": out.decode(errors="replace")[:_MAX_OUTPUT],
        "stderr": err.decode(errors="replace")[:_MAX_OUTPUT],
        "exit_code": proc.returncode,
        "duration_ms": duration_ms,
        "timed_out": timed_out,
    }
