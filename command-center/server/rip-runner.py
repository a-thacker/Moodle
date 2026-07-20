#!/usr/bin/env python3
"""Command Center DVD rip runner — the host side of the rip queue.

The backend can't rip (it's in a container; the optical drive is on the host),
so this polls the backend for queued rip jobs, runs the non-interactive
`ripdvd-auto` script for each, streams its output back as progress, and posts
the final result. Same "the machine polls" shape as the Mac script runner
(agent/scripts_runner.py), but it runs on the server host as the `athacker` user
(who can reach /dev/sr0 and /srv/media without root).

Stdlib only (urllib) so it needs no pip installs on the host.

Env (see rip.env):
    CC_API_URL    backend base URL (default http://localhost:8000)
    CC_API_KEY    shared agent key (must match AGENT_API_KEY in the server .env)
    RIP_SCRIPT    path to ripdvd-auto (default ~/cc-agent/ripdvd-auto)
    RIP_POLL      seconds between queue polls (default 5)
    RIP_TIMEOUT   per-rip timeout seconds (default 14400 = 4h)
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("rip-runner")

API_URL = os.environ.get("CC_API_URL", "http://localhost:8000").rstrip("/")
API_KEY = os.environ.get("CC_API_KEY", "")
RIP_SCRIPT = os.path.expanduser(os.environ.get("RIP_SCRIPT", "~/cc-agent/ripdvd-auto"))
POLL_SECONDS = float(os.environ.get("RIP_POLL", "5"))
RUN_TIMEOUT = float(os.environ.get("RIP_TIMEOUT", "14400"))
BASE = f"{API_URL}/api/v1/rip"
_FLUSH_SECONDS = 4.0  # push accumulated progress at least this often


def _request(method: str, path: str, payload: dict | None = None) -> object:
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("X-API-Key", API_KEY)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = resp.read()
    return json.loads(body) if body else None


def claim() -> list[dict]:
    got = _request("GET", "/queue")
    return got if isinstance(got, list) else []


def send_progress(job_id: int, chunk: str) -> None:
    try:
        _request("POST", f"/jobs/{job_id}/progress", {"chunk": chunk})
    except urllib.error.URLError as exc:
        logger.warning("progress post failed (job %s): %s", job_id, exc)


def send_result(job_id: int, exit_code: int | None, progress: str) -> None:
    try:
        _request("POST", f"/jobs/{job_id}/result", {"exit_code": exit_code, "progress": progress[-200_000:]})
    except urllib.error.URLError as exc:
        logger.warning("result post failed (job %s): %s", job_id, exc)


def run_job(job: dict) -> None:
    job_id = job["id"]
    title = job.get("title") or ""
    extras = job.get("extras") or "extras"
    logger.info("Ripping job %s: %r (extras=%s)", job_id, title, extras)

    if not (Path(RIP_SCRIPT).is_file() and os.access(RIP_SCRIPT, os.X_OK)):
        send_result(job_id, 127, f"Rip script not found or not executable: {RIP_SCRIPT}")
        return

    env = dict(os.environ, RIP_TITLE=title, RIP_EXTRAS=extras)
    full: list[str] = []
    buf: list[str] = []
    last_flush = time.monotonic()

    def flush() -> None:
        nonlocal last_flush
        if buf:
            chunk = "".join(buf)
            buf.clear()
            send_progress(job_id, chunk)
        last_flush = time.monotonic()

    try:
        proc = subprocess.Popen(
            [RIP_SCRIPT], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1,
        )
        start = time.monotonic()
        assert proc.stdout is not None
        for line in proc.stdout:
            full.append(line)
            buf.append(line)
            if time.monotonic() - last_flush >= _FLUSH_SECONDS:
                flush()
            if time.monotonic() - start > RUN_TIMEOUT:
                proc.kill()
                full.append("\nERROR: rip timed out.\n")
                break
        proc.wait(timeout=60)
        flush()
        send_result(job_id, proc.returncode, "".join(full))
        logger.info("Job %s finished (exit %s)", job_id, proc.returncode)
    except Exception as exc:  # noqa: BLE001 — always report, never crash the loop
        full.append(f"\nRunner error: {exc}\n")
        send_result(job_id, 1, "".join(full))
        logger.warning("Job %s errored: %s", job_id, exc)


def main() -> None:
    if not API_KEY:
        logger.error("CC_API_KEY is empty — set it in rip.env. Exiting.")
        raise SystemExit(1)
    logger.info("Rip runner polling %s (script: %s)", BASE, RIP_SCRIPT)
    while True:
        try:
            for job in claim():
                run_job(job)
        except urllib.error.URLError as exc:
            logger.warning("queue poll failed: %s", exc)
        except Exception as exc:  # noqa: BLE001 — keep the daemon alive
            logger.warning("unexpected loop error: %s", exc)
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
