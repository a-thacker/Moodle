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
    RIP_TIMEOUT   per-rip hard timeout seconds (default 21600 = 6h). This is
                  the only automatic abort — a real rip always finishes well
                  under it, so it can't false-fire; it just stops a truly
                  infinite hang (e.g. a Blu-ray with no LibreDrive support).
    RIP_STALL     OFF by default (0). Optional no-output stall abort in seconds.
                  Leave disabled: makemkvcon legitimately goes silent for a long
                  time while working around scratched/corrupt sectors, so a
                  stall abort kills healthy rips. Only set it if you know why.
"""

from __future__ import annotations

import json
import logging
import os
import queue
import signal
import subprocess
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("rip-runner")

API_URL = os.environ.get("CC_API_URL", "http://localhost:8000").rstrip("/")
API_KEY = os.environ.get("CC_API_KEY", "")
RIP_SCRIPT = os.path.expanduser(os.environ.get("RIP_SCRIPT", "~/cc-agent/ripdvd-auto"))
RIP_TV_SCRIPT = os.path.expanduser(os.environ.get("RIP_TV_SCRIPT", "~/cc-agent/riptv-auto"))
POLL_SECONDS = float(os.environ.get("RIP_POLL", "5"))
RUN_TIMEOUT = float(os.environ.get("RIP_TIMEOUT", "21600"))   # 6h hard cap
STALL_TIMEOUT = float(os.environ.get("RIP_STALL", "0"))       # 0 = disabled (false-fires on scratched discs)
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


def _kill_tree(proc: subprocess.Popen) -> None:
    """SIGTERM then SIGKILL the rip's whole process group. The script is a shell
    whose real worker (makemkvcon) is a grandchild, so killing just `proc` would
    orphan makemkvcon and leave it pinning the CPU / holding the drive. We start
    the script in its own session (start_new_session=True) so its PID is the
    group id and one killpg takes the whole tree down."""
    for sig in (signal.SIGTERM, signal.SIGKILL):
        try:
            os.killpg(os.getpgid(proc.pid), sig)
        except (ProcessLookupError, PermissionError):
            return
        try:
            proc.wait(timeout=8)
            return
        except subprocess.TimeoutExpired:
            continue


def run_job(job: dict) -> None:
    job_id = job["id"]
    media = job.get("media_type") or "movie"

    if media == "tv":
        script = RIP_TV_SCRIPT
        env = dict(
            os.environ,
            RIP_MEDIA_TYPE="tv",
            RIP_SHOW=job.get("show_name") or "",
            RIP_SEASON=str(job.get("season") or ""),
            RIP_START_EPISODE=str(job.get("start_episode") or ""),
            RIP_EPISODE_COUNT=str(job.get("episode_count") or ""),
        )
        logger.info(
            "Ripping TV job %s: %r S%s E%s x%s", job_id,
            job.get("show_name"), job.get("season"), job.get("start_episode"), job.get("episode_count"),
        )
    else:
        script = RIP_SCRIPT
        env = dict(os.environ, RIP_TITLE=job.get("title") or "", RIP_EXTRAS=job.get("extras") or "extras")
        logger.info("Ripping job %s: %r (extras=%s)", job_id, job.get("title"), job.get("extras"))

    if not (Path(script).is_file() and os.access(script, os.X_OK)):
        send_result(job_id, 127, f"Rip script not found or not executable: {script}")
        return

    full: list[str] = []
    buf: list[str] = []
    last_flush = time.monotonic()

    def flush() -> None:
        nonlocal last_flush
        if buf:
            send_progress(job_id, "".join(buf))
            buf.clear()
        last_flush = time.monotonic()

    try:
        # Own session/process group so _kill_tree can reap makemkvcon too.
        proc = subprocess.Popen(
            [script], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1, start_new_session=True,
        )
    except Exception as exc:  # noqa: BLE001
        send_result(job_id, 1, f"Runner error starting rip: {exc}")
        logger.warning("Job %s failed to start: %s", job_id, exc)
        return

    # A reader thread drains stdout into a queue so the main loop can enforce the
    # timeouts on a steady tick — even when makemkvcon goes totally silent. (The
    # old inline `for line in proc.stdout` blocked here forever on a wedged rip,
    # so its timeout check never ran; that's why a hung Blu-ray sat for 73 min.)
    q: "queue.Queue[str | None]" = queue.Queue()

    def reader() -> None:
        try:
            assert proc.stdout is not None
            for line in proc.stdout:
                q.put(line)
        finally:
            q.put(None)  # EOF sentinel

    threading.Thread(target=reader, daemon=True).start()

    start = time.monotonic()
    last_output = start
    reason: str | None = None
    try:
        while True:
            try:
                line = q.get(timeout=1.0)
            except queue.Empty:
                line = ""  # no output this tick — still check the clocks below
            if line is None:
                break  # rip finished on its own
            if line:
                full.append(line)
                buf.append(line)
                last_output = time.monotonic()
            now = time.monotonic()
            if buf and now - last_flush >= _FLUSH_SECONDS:
                flush()
            if now - start > RUN_TIMEOUT:
                reason = f"rip exceeded the {int(RUN_TIMEOUT)}s hard cap"
                break
            # Stall abort is opt-in (RIP_STALL>0). Off by default because
            # makemkvcon goes silent for long stretches on scratched discs.
            if STALL_TIMEOUT > 0 and now - last_output > STALL_TIMEOUT and proc.poll() is None:
                reason = f"no output for {int(STALL_TIMEOUT)}s (RIP_STALL) — aborting"
                break

        if reason:
            logger.warning("Job %s: %s", job_id, reason)
            full.append(f"\nERROR: {reason}.\n")
            _kill_tree(proc)
        try:
            proc.wait(timeout=60)
        except subprocess.TimeoutExpired:
            _kill_tree(proc)
        flush()
        send_result(job_id, proc.returncode, "".join(full))
        logger.info("Job %s finished (exit %s)", job_id, proc.returncode)
    except Exception as exc:  # noqa: BLE001 — always report, never crash the loop
        full.append(f"\nRunner error: {exc}\n")
        _kill_tree(proc)
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
