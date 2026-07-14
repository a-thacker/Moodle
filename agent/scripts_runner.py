"""Laptop script runner — the Mac side of the Command Center script queue.

The server can't reach the Mac, so the Mac polls: report which scripts are
available (every executable in ``~/cc-scripts/``), claim any jobs the dashboard
queued, run them locally, and post the output back. Same "Mac pushes" shape as
the eClass sync and the Claude-usage report.

Scripts are plain executables in ``CC_SCRIPTS_DIR`` (default ``~/cc-scripts``).
The filename is the script id; a leading ``# desc:`` comment becomes its
description in the UI. Arguments queued from the dashboard are passed through
``shlex.split`` as separate argv (never shell-interpolated).

Env:
    CC_API_URL / CC_API_KEY   backend + shared agent key (as for the sync agent)
    CC_SCRIPTS_DIR            scripts folder (default ~/cc-scripts)
    CC_SCRIPTS_POLL          seconds between polls (default 3)
    CC_SCRIPTS_TIMEOUT       per-script timeout seconds (default 600)
"""

from __future__ import annotations

import logging
import os
import shlex
import subprocess
import time
from pathlib import Path

import requests

logger = logging.getLogger(__name__)

SCRIPTS_DIR = Path(os.environ.get("CC_SCRIPTS_DIR", "~/cc-scripts")).expanduser()
POLL_SECONDS = float(os.environ.get("CC_SCRIPTS_POLL", "3"))
RUN_TIMEOUT = float(os.environ.get("CC_SCRIPTS_TIMEOUT", "600"))
_MAX_OUTPUT = 100_000
_REGISTRY_EVERY = 30.0  # re-report the script list at most this often


def _label(name: str) -> str:
    return Path(name).stem.replace("-", " ").replace("_", " ").strip().title() or name


def _describe(path: Path) -> str:
    try:
        for line in path.read_text(errors="ignore").splitlines()[:8]:
            s = line.strip()
            if s.lower().startswith("# desc:"):
                return s.split(":", 1)[1].strip()
    except OSError:
        pass
    return ""


def discover() -> list[dict]:
    """Every executable, non-hidden file in the scripts dir, as registry rows."""
    if not SCRIPTS_DIR.is_dir():
        return []
    scripts = []
    for p in sorted(SCRIPTS_DIR.iterdir()):
        if p.is_file() and not p.name.startswith(".") and os.access(p, os.X_OK):
            scripts.append({"id": p.name, "label": _label(p.name), "description": _describe(p)})
    return scripts


class ScriptsAgent:
    def __init__(self, api_url: str, api_key: str) -> None:
        self._base = f"{api_url.rstrip('/')}/api/v1/scripts"
        self._session = requests.Session()
        self._session.headers.update({"X-API-Key": api_key})

    def push_registry(self) -> list[dict]:
        scripts = discover()
        resp = self._session.put(f"{self._base}/registry", json=scripts, timeout=15)
        resp.raise_for_status()
        return scripts

    def poll_once(self) -> int:
        """Claim and run any queued jobs; return how many ran."""
        resp = self._session.get(f"{self._base}/queue", timeout=15)
        resp.raise_for_status()
        jobs = resp.json()
        for job in jobs:
            self._run(job)
        return len(jobs)

    def _run(self, job: dict) -> None:
        job_id = job["id"]
        script = job.get("script", "")
        args = job.get("args") or ""
        path = SCRIPTS_DIR / script
        # Guard against path escapes and non-executables.
        if os.path.sep in script or script in ("", ".", "..") or path.parent != SCRIPTS_DIR:
            self._post_result(job_id, 127, "", f"Illegal script name: {script!r}")
            return
        if not (path.is_file() and os.access(path, os.X_OK)):
            self._post_result(job_id, 127, "", f"Not an executable script: {script}")
            return
        try:
            argv = [str(path), *shlex.split(args)]
        except ValueError as exc:
            self._post_result(job_id, 2, "", f"Bad arguments: {exc}")
            return

        logger.info("Running %s (job %s)", script, job_id)
        try:
            proc = subprocess.run(
                argv, cwd=str(SCRIPTS_DIR), capture_output=True, text=True, timeout=RUN_TIMEOUT
            )
            self._post_result(job_id, proc.returncode, proc.stdout, proc.stderr)
        except subprocess.TimeoutExpired:
            self._post_result(job_id, 124, "", f"Timed out after {RUN_TIMEOUT:.0f}s")
        except Exception as exc:  # noqa: BLE001 — always report, never crash the loop
            self._post_result(job_id, 1, "", f"Runner error: {exc}")

    def _post_result(self, job_id: int, code: int | None, out: str, err: str) -> None:
        try:
            resp = self._session.post(
                f"{self._base}/jobs/{job_id}/result",
                json={"exit_code": code, "stdout": (out or "")[:_MAX_OUTPUT], "stderr": (err or "")[:_MAX_OUTPUT]},
                timeout=15,
            )
            resp.raise_for_status()
        except requests.RequestException as exc:
            logger.warning("Failed to post result for job %s: %s", job_id, exc)


def run_daemon(api_url: str, api_key: str) -> int:
    """Poll forever: report the registry periodically, run queued jobs."""
    agent = ScriptsAgent(api_url, api_key)
    logger.info("Scripts runner watching %s → %s", SCRIPTS_DIR, api_url)
    last_registry = 0.0
    while True:
        try:
            now = time.monotonic()
            if now - last_registry >= _REGISTRY_EVERY:
                agent.push_registry()
                last_registry = now
            agent.poll_once()
        except requests.RequestException as exc:
            logger.warning("Scripts poll failed: %s", exc)
            last_registry = 0.0  # re-report registry once we reconnect
        time.sleep(POLL_SECONDS)


def run_once(api_url: str, api_key: str) -> int:
    """One registry report + one queue drain (for manual testing)."""
    agent = ScriptsAgent(api_url, api_key)
    scripts = agent.push_registry()
    ran = agent.poll_once()
    print(f"Reported {len(scripts)} script(s) from {SCRIPTS_DIR}; ran {ran} queued job(s).")
    return 0
