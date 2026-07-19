#!/usr/bin/env bash
# Production deploy script for Vairiot.
# Run on the prod server from anywhere:  bash /opt/Vairiot/infra/deploy.sh
#
# What it does:
#   1. Pulls latest main
#   2. Rebuilds and (re)starts containers using the repo-root .env
#      — the `migrate` service applies Prisma migrations before the API starts
#   3. Reloads nginx to pick up any prod.conf changes (upstream IPs no longer
#      require a restart: nginx re-resolves them at request time via `resolver`)
#   4. Prints container status
#
# TLS renewal: certbot should reload nginx after renewing. Install a deploy hook once:
#   echo 'docker exec vairiot_nginx nginx -s reload' \
#     | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
#   sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
# Without it, a renewed cert is not served until the next deploy/restart.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${REPO_DIR}/.env"
COMPOSE_FILE="${REPO_DIR}/infra/docker-compose.prod.yml"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found." >&2
  exit 1
fi

cd "$REPO_DIR"

echo "→ Pulling latest main…"
git pull --ff-only

echo "→ Building & starting containers (migrations run via the migrate service)…"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build

echo "→ Reloading nginx to pick up any prod.conf changes…"
docker exec vairiot_nginx nginx -s reload >/dev/null 2>&1 || docker restart vairiot_nginx >/dev/null

echo "→ Container status:"
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

echo
echo "✅ Deploy complete."
