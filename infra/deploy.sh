#!/usr/bin/env bash
# Production deploy script for Vairiot.
# Run on the prod server from anywhere:  bash /opt/Vairiot/infra/deploy.sh
#
# What it does:
#   1. Pulls latest main
#   2. Rebuilds and restarts containers using the repo-root .env
#   3. Restarts nginx so it re-resolves the new api container IP
#   4. Prints container status

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

echo "→ Building & starting containers…"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build

echo "→ Restarting nginx so it re-resolves upstreams…"
docker restart vairiot_nginx >/dev/null

echo "→ Container status:"
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

echo
echo "✅ Deploy complete."
