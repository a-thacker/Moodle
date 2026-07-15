#!/usr/bin/env python3
"""Codex bridge — HTTP in front of the OpenAI `codex` CLI, for the sibling.

Same idea as claude-bridge.py: the Command Center backend runs in Docker and
can't see the host's `codex` login, so this tiny stdlib server runs ON THE HOST
and shells out to `codex exec`. `codex` here is logged in with the sibling's
**ChatGPT subscription** — so it counts against his subscription, NOT the
pay-as-you-go OpenAI API.

Unlike the Claude bridge it's stateless: the backend already injects the
sibling's context and parses actions, so this just turns one prompt into text.

Endpoints:
  POST /chat   {"prompt": str, "user_id": str}  -> {"reply", "available"}
  GET  /health                                   -> {"ok": true}

Tunables (env), since codex CLI flags vary by version:
  CODEX_BIN            path to codex        (default: codex, resolved on PATH)
  CODEX_AGENT_DIR      working dir          (default: ~/codex-agent)
  CC_CODEX_BRIDGE_PORT port                 (default: 8788)
  CODEX_MODEL          --model to pass      (default: unset = codex default)
  CODEX_EXEC_ARGS      subcommand + flags   (default: "exec --skip-git-repo-check")
  CODEX_JSON=1         parse --json event stream for the final message
  CODEX_TIMEOUT        seconds              (default: 180)

Start detached (see run-codex-bridge.sh):
  setsid ~/codex-agent/run-codex-bridge.sh >~/codex-agent/codex-bridge.log 2>&1 </dev/null &
"""

from __future__ import annotations

import json
import os
import shlex
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

WORKDIR = os.path.expanduser(os.environ.get("CODEX_AGENT_DIR", "~/codex-agent"))
CODEX = os.path.expanduser(os.environ.get("CODEX_BIN", "codex"))
PORT = int(os.environ.get("CC_CODEX_BRIDGE_PORT", "8788"))
MODEL = os.environ.get("CODEX_MODEL", "")
EXEC_ARGS = shlex.split(os.environ.get("CODEX_EXEC_ARGS", "exec --skip-git-repo-check"))
USE_JSON = os.environ.get("CODEX_JSON", "") not in ("", "0", "false")
TIMEOUT = int(os.environ.get("CODEX_TIMEOUT", "180"))

_lock = threading.Lock()  # serialize codex calls (low volume, one sibling)


def _extract(stdout: str) -> str:
    """Best-effort: with CODEX_JSON, pull the last agent message out of the
    JSONL event stream; otherwise return stdout as-is."""
    text = stdout.strip()
    if not USE_JSON:
        return text
    last = ""
    for line in text.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            evt = json.loads(line)
        except json.JSONDecodeError:
            continue
        # codex emits message/agent-message events; grab whatever carries text.
        msg = evt.get("message") or evt.get("text") or evt.get("content")
        if isinstance(msg, str) and msg.strip():
            last = msg.strip()
    return last or text


def run_codex(prompt: str) -> str:
    cmd = [CODEX, *EXEC_ARGS]
    if MODEL:
        cmd += ["--model", MODEL]
    if USE_JSON and "--json" not in cmd:
        cmd += ["--json"]
    cmd += [prompt]
    env = dict(os.environ, PATH=f"{os.path.dirname(CODEX) or '/usr/local/bin'}:{os.environ.get('PATH', '')}")
    with _lock:
        proc = subprocess.run(
            cmd, cwd=WORKDIR, capture_output=True, text=True, timeout=TIMEOUT, env=env
        )
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout or "codex failed").strip()[:500])
    return _extract(proc.stdout)


class Handler(BaseHTTPRequestHandler):
    def _json(self, code: int, obj: dict) -> None:
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        self._json(200, {"ok": True}) if self.path == "/health" else self._json(404, {"error": "not found"})

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
        prompt = (payload.get("prompt") or "").strip()
        if not prompt:
            self._json(400, {"error": "empty prompt"})
            return
        try:
            reply = run_codex(prompt)
            self._json(200, {"reply": reply or "(no response)", "available": True})
        except subprocess.TimeoutExpired:
            self._json(200, {"reply": "The assistant took too long and timed out.", "available": False})
        except Exception as exc:  # noqa: BLE001
            self._json(200, {"reply": f"Assistant error: {exc}", "available": False})

    def log_message(self, *_args) -> None:
        pass


def main() -> None:
    host = os.environ.get("CC_CODEX_BRIDGE_HOST", "0.0.0.0")
    server = ThreadingHTTPServer((host, PORT), Handler)
    print(f"codex-bridge listening on {host}:{PORT} (workdir={WORKDIR}, model={MODEL or 'default'}, json={USE_JSON})", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
