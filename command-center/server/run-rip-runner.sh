#!/usr/bin/env bash
# Runs the DVD rip runner on the host (as athacker, who can reach /dev/sr0 and
# /srv/media without root). The backend is reached at http://localhost:8000.
# Start detached:
#   setsid ~/cc-agent/run-rip-runner.sh >~/cc-agent/rip-runner.log 2>&1 </dev/null & disown
set -euo pipefail

export PATH="$HOME/.local/bin:$PATH"
export CC_AGENT_DIR="${CC_AGENT_DIR:-$HOME/cc-agent}"

# Secrets / config (CC_API_KEY etc.) live in rip.env, never in git.
if [[ -f "$CC_AGENT_DIR/rip.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$CC_AGENT_DIR/rip.env"
  set +a
fi

export RIP_SCRIPT="${RIP_SCRIPT:-$CC_AGENT_DIR/ripdvd-auto}"

exec python3 "$CC_AGENT_DIR/rip-runner.py"
