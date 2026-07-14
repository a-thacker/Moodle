#!/usr/bin/env bash
# Runs the Claude bridge on the host so `claude -p` uses the host's
# subscription login (counts against Alden's quota, not the paid API).
# The Command Center backend reaches it at http://host.docker.internal:8787.
# Start detached:
#   setsid ~/cc-agent/run-bridge.sh >~/cc-agent/bridge.log 2>&1 </dev/null & disown
set -euo pipefail

export PATH="$HOME/.local/bin:$PATH"
export CC_AGENT_DIR="${CC_AGENT_DIR:-$HOME/cc-agent}"
export CC_CLAUDE_BRIDGE_PORT="${CC_CLAUDE_BRIDGE_PORT:-8787}"

exec python3 "$CC_AGENT_DIR/claude-bridge.py"
