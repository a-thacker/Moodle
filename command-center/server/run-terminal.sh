#!/usr/bin/env bash
# Serves Claude Code as a web terminal (ttyd) for the Command Center site.
# Runs on the host so `claude` uses the host's subscription login. Bound to
# all interfaces (Tailnet); the site embeds it. Start detached:
#   setsid ~/cc-agent/run-terminal.sh >~/cc-agent/ttyd.log 2>&1 </dev/null & disown
set -euo pipefail

export PATH="$HOME/.local/bin:$PATH"
PORT="${CC_TERMINAL_PORT:-7681}"

# One session at a time; --writable lets you type; reconnect allowed.
exec ttyd \
  -p "$PORT" \
  --writable \
  -t 'titleFixed=Command Center · Claude' \
  -t 'fontSize=14' \
  -t 'theme={"background":"#0a0b11"}' \
  bash -lc 'cd "$HOME/cc-agent" && exec claude'
