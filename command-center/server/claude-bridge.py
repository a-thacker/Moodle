#!/usr/bin/env python3
"""Claude bridge — HTTP in front of headless `claude -p` on the host.

The Command Center backend runs in Docker and can't see the host's Claude
login (~/.claude) or the `claude` binary. This tiny stdlib server runs ON THE
HOST, so `claude -p` uses the host's subscription — it counts against Alden's
existing Claude quota, NOT the pay-as-you-go API. The backend POSTs here to
power the site's assistant.

Conversation memory is per-user: we keep each user's Claude `session_id` and
pass `--resume` so follow-ups remember the thread. The map is in memory —
restarting the bridge just starts everyone a fresh Claude session (Claude
re-reads `cc context` either way, so no real state is lost).

Endpoints:
  POST /chat   {"message": str, "user_id": str}  -> {"reply", "available"}
  GET  /health                                    -> {"ok": true}

Start detached (see run-bridge.sh):
  setsid ~/cc-agent/run-bridge.sh >~/cc-agent/bridge.log 2>&1 </dev/null &
"""

from __future__ import annotations

import json
import os
import subprocess
import threading
from collections import defaultdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

WORKDIR = os.path.expanduser(os.environ.get("CC_AGENT_DIR", "~/cc-agent"))
CLAUDE = os.path.expanduser(os.environ.get("CC_CLAUDE_BIN", "~/.local/bin/claude"))
PORT = int(os.environ.get("CC_CLAUDE_BRIDGE_PORT", "8787"))
MODEL = os.environ.get("CC_CLAUDE_MODEL", "")  # empty => claude's own default
TIMEOUT = int(os.environ.get("CC_CLAUDE_TIMEOUT", "240"))

# user_id -> claude session_id, plus a per-user lock so one user's turns run
# sequentially (a Claude session can't be resumed concurrently).
_sessions: dict[str, str] = {}
_locks: defaultdict[str, threading.Lock] = defaultdict(threading.Lock)


def _run_claude(message: str, user_id: str, _retry: bool = False) -> str:
    sid = _sessions.get(user_id)
    cmd = [CLAUDE, "-p", message, "--output-format", "json", "--allowedTools", "Bash"]
    if MODEL:
        cmd += ["--model", MODEL]
    if sid:
        cmd += ["--resume", sid]

    env = dict(os.environ, PATH=f"{os.path.dirname(CLAUDE)}:{os.environ.get('PATH', '')}")
    proc = subprocess.run(
        cmd, cwd=WORKDIR, capture_output=True, text=True, timeout=TIMEOUT, env=env
    )
    if proc.returncode != 0:
        # A stale/invalid session id is the common failure — drop it and retry
        # once from a fresh session before giving up.
        if sid and not _retry:
            _sessions.pop(user_id, None)
            return _run_claude(message, user_id, _retry=True)
        raise RuntimeError((proc.stderr or proc.stdout or "claude failed").strip()[:500])

    data = json.loads(proc.stdout)
    new_sid = data.get("session_id")
    if new_sid:
        _sessions[user_id] = new_sid
    return (data.get("result") or "").strip()


class Handler(BaseHTTPRequestHandler):
    def _json(self, code: int, obj: dict) -> None:
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self._json(200, {"ok": True})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/chat":
            self._json(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            self._json(400, {"error": "bad json"})
            return

        message = (payload.get("message") or "").strip()
        user_id = str(payload.get("user_id") or "default")
        if not message:
            self._json(400, {"error": "empty message"})
            return

        try:
            with _locks[user_id]:
                reply = _run_claude(message, user_id)
            self._json(200, {"reply": reply or "(no response)", "available": True})
        except subprocess.TimeoutExpired:
            self._json(200, {"reply": "The assistant took too long and timed out.", "available": False})
        except Exception as exc:  # noqa: BLE001 — surface any failure as a reply
            self._json(200, {"reply": f"Assistant error: {exc}", "available": False})

    def log_message(self, *_args) -> None:  # silence per-request logging
        pass


def main() -> None:
    host = os.environ.get("CC_CLAUDE_BRIDGE_HOST", "0.0.0.0")
    server = ThreadingHTTPServer((host, PORT), Handler)
    print(f"claude-bridge listening on {host}:{PORT} (workdir={WORKDIR}, model={MODEL or 'default'})", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
