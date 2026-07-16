#!/usr/bin/env bash
# Deploy the Command Center to the self-hosted server (athacker-cc, ssh alias
# `cc`). Rsyncs the source, rebuilds the Docker images — the backend entrypoint
# applies Alembic migrations on start — then re-seeds accounts.
#
# Safe to re-run. Does NOT touch the server's Postgres data (./data) or its
# .env (both are excluded from the sync).
#
#   Usage:  ./deploy.sh
#   Env:    CC_HOST (default: cc)   CC_REMOTE_DIR (default: ~/command-center)
set -euo pipefail

HOST="${CC_HOST:-cc}"
REMOTE_DIR="${CC_REMOTE_DIR:-~/command-center}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Syncing source to ${HOST}:${REMOTE_DIR}"
rsync -avz --delete \
  --exclude='.git/' \
  --exclude='data/' \
  --exclude='.env' \
  --exclude='node_modules/' \
  --exclude='__pycache__/' \
  --exclude='*.pyc' \
  --exclude='.venv/' \
  --exclude='dist/' \
  --exclude='.DS_Store' \
  "${HERE}/" "${HOST}:${REMOTE_DIR}/"

echo "==> Building & starting containers (entrypoint runs 'alembic upgrade head')"
ssh "${HOST}" "cd ${REMOTE_DIR} && docker compose up -d --build"

echo "==> Waiting for the API to report healthy"
ssh "${HOST}" "cd ${REMOTE_DIR} && for i in \$(seq 1 30); do
  if curl -fsS http://localhost:8000/health >/dev/null 2>&1; then echo '    API healthy'; break; fi
  sleep 2
done"

echo "==> Seeding / updating accounts (idempotent; sets non-owners to role=user)"
ssh "${HOST}" "cd ${REMOTE_DIR} && docker compose exec -T backend python -m scripts.seed_users"

echo "==> Recent backend logs"
ssh "${HOST}" "cd ${REMOTE_DIR} && docker compose logs --tail=20 backend"

echo "Done. Open http://athacker-cc:5173 and sign in as the owner."
