#!/usr/bin/env bash
# Container entrypoint: bring the schema up to date, then hand off to the
# server (or whatever CMD was given). Migrations run here — not in the app's
# lifespan — so scaling to multiple app processes doesn't race on migrations.
set -euo pipefail

echo "[entrypoint] Applying database migrations…"
alembic upgrade head

echo "[entrypoint] Starting: $*"
exec "$@"
