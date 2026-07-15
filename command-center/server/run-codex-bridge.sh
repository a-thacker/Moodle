#!/usr/bin/env bash
# Runs the Codex bridge on the host so `codex` uses the sibling's ChatGPT
# subscription login (counts against his subscription, not the paid API).
# The Command Center backend reaches it at http://host.docker.internal:8788.
# Start detached:
#   setsid ~/codex-agent/run-codex-bridge.sh >~/codex-agent/codex-bridge.log 2>&1 </dev/null & disown
set -euo pipefail

export PATH="$HOME/.local/bin:/usr/local/bin:$PATH"
export CODEX_AGENT_DIR="${CODEX_AGENT_DIR:-$HOME/codex-agent}"
export CC_CODEX_BRIDGE_PORT="${CC_CODEX_BRIDGE_PORT:-8788}"

exec python3 "$CODEX_AGENT_DIR/codex-bridge.py"
