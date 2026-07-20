#!/usr/bin/env bash
# Regenerate the Tailscale-issued Let's Encrypt cert for the MagicDNS name and
# hand it to Nginx Proxy Manager, then reload nginx. Tailscale certs last ~90
# days; a monthly cron keeps NPM current with zero clicks.
#
# Requires: athacker is the tailscale operator
#   sudo tailscale set --operator=athacker
#
# The custom-cert directory id (npm-N) is set the first time the cert is added
# in NPM; pass it as $1 or via NPM_CERT_ID (defaults to 1).
set -euo pipefail

NAME="athacker-cc.tail5e74e4.ts.net"
INFRA_DIR="$HOME/infra"
CERT_DIR="$INFRA_DIR/certs"
CERT_ID="${1:-${NPM_CERT_ID:-1}}"
NPM_CUSTOM="$INFRA_DIR/data/npm/data/custom_ssl/npm-${CERT_ID}"

mkdir -p "$CERT_DIR"
tailscale cert --cert-file "$CERT_DIR/fullchain.crt" --key-file "$CERT_DIR/private.key" "$NAME"

if [[ -d "$NPM_CUSTOM" ]]; then
  # NPM writes its cert files as root, so overwrite them THROUGH the container
  # (docker runs as root; we're in the docker group). The bind-mounted volume
  # persists the change to $NPM_CUSTOM on the host.
  NPM_CID=$( cd "$INFRA_DIR" && docker compose ps -q npm )
  docker cp "$CERT_DIR/fullchain.crt" "$NPM_CID:/data/custom_ssl/npm-${CERT_ID}/fullchain.pem"
  docker cp "$CERT_DIR/private.key"  "$NPM_CID:/data/custom_ssl/npm-${CERT_ID}/privkey.pem"
  ( cd "$INFRA_DIR" && docker compose exec -T npm nginx -s reload ) || true
  echo "Renewed cert for $NAME and reloaded NPM (custom cert id ${CERT_ID})."
else
  echo "Cert generated at $CERT_DIR, but NPM custom-cert dir $NPM_CUSTOM not found."
  echo "Create the custom certificate in NPM once, then set the right id."
fi
