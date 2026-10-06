#!/usr/bin/env bash
# Production deploy script for Vairiot.
# Run on the prod server from anywhere:  bash /opt/Vairiot/infra/deploy.sh
#
# What it does, stopping at the first failure:
#   1. Pulls latest main
#   2. Builds every image
#   3. Applies Prisma migrations as a separate step. A failed migration stops
#      the deploy here, before any running container is replaced, so the
#      current version keeps serving.
#   4. Starts the new containers
#   5. Waits until every long-running container reports healthy
#   6. Reloads nginx (upstream IPs re-resolve at request time via `resolver`)
#   7. Checks /health/ready from inside the api container (database + Redis)
#   8. Installs the certbot renewal hook if it is missing
#
# Exit code is non-zero if any step fails; the failing container's recent
# logs are printed. Settings (optional, in .env):
#   COMPOSE_EXTRA_FILE    extra compose file, e.g. infra/docker-compose.staging-shared.yml
#   DEPLOY_WAIT_SECONDS   how long to wait for healthy containers (default 300)

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${REPO_DIR}/.env"
COMPOSE_FILE="${REPO_DIR}/infra/docker-compose.prod.yml"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found." >&2
  exit 1
fi

cd "$REPO_DIR"

env_value() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true; }

# Optional extra compose file (e.g. staging on a shared host where the box's
# own nginx fronts the stack).
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
EXTRA_FILE="$(env_value COMPOSE_EXTRA_FILE)"
if [ -n "$EXTRA_FILE" ]; then
  echo "→ Using extra compose file: $EXTRA_FILE"
  COMPOSE+=(-f "$REPO_DIR/$EXTRA_FILE")
fi
if [ -z "$(env_value MINIO_ACCESS_KEY)" ]; then
  echo "⚠  MINIO_ACCESS_KEY is not set: the API uses the MinIO root credentials."
  echo "   Set MINIO_ACCESS_KEY and MINIO_SECRET_KEY in .env (DEPLOY.md → Operational env vars)."
fi
WAIT_SECONDS="$(env_value DEPLOY_WAIT_SECONDS)"
WAIT_SECONDS="${WAIT_SECONDS:-300}"

die() {
  echo "" >&2
  echo "❌ DEPLOY FAILED: $*" >&2
  exit 1
}

echo "→ Pulling latest…"
git pull --ff-only

echo "→ Building images…"
"${COMPOSE[@]}" build

echo "→ Applying database migrations…"
"${COMPOSE[@]}" run --rm migrate \
  || die "migrations failed — nothing was restarted; the previous version is still serving. Fix the migration and deploy again."

echo "→ Starting containers…"
"${COMPOSE[@]}" up -d --remove-orphans

# Wait for every long-running container to be running and, where it has a
# healthcheck, healthy. Done here rather than with `up --wait`, whose handling
# of one-shot containers (migrate) has varied between Compose releases.
echo "→ Waiting up to ${WAIT_SECONDS}s for containers to become healthy…"
deadline=$(( $(date +%s) + WAIT_SECONDS ))
while :; do
  pending=()
  # -a: include exited containers, so a failed one-shot is seen.
  for id in $("${COMPOSE[@]}" ps -a -q); do
    read -r name state health restart code < <(docker inspect -f \
      '{{.Name}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} {{.HostConfig.RestartPolicy.Name}} {{.State.ExitCode}}' "$id")
    name="${name#/}"
    # One-shot jobs (migrate, minio-init): done when they exited 0.
    if [ "$restart" = "no" ] && [ "$state" = "exited" ]; then
      [ "$code" = "0" ] && continue
      echo "--- last logs of ${name} ---" >&2
      docker logs --tail 30 "$name" >&2 2>&1 || true
      die "${name} failed (exit code ${code})"
    fi
    if [ "$state" != "running" ] || { [ "$health" != "healthy" ] && [ "$health" != "none" ]; }; then
      pending+=("${name}(${state}/${health})")
    fi
  done
  [ ${#pending[@]} -eq 0 ] && break
  if [ "$(date +%s)" -ge "$deadline" ]; then
    for p in "${pending[@]}"; do
      echo "--- last logs of ${p%%(*} ---" >&2
      docker logs --tail 30 "${p%%(*}" >&2 2>&1 || true
    done
    die "not healthy after ${WAIT_SECONDS}s: ${pending[*]}"
  fi
  sleep 5
done
echo "  ✓ all containers healthy"

# Reload the bundled nginx if it's part of this deployment (it isn't on shared
# hosts, where the host nginx fronts the stack instead).
if docker ps --format '{{.Names}}' | grep -q '^vairiot_nginx$'; then
  echo "→ Reloading nginx to pick up any conf changes…"
  docker exec vairiot_nginx nginx -s reload >/dev/null 2>&1 || docker restart vairiot_nginx >/dev/null
fi

echo "→ Checking /health/ready…"
READY="$(docker exec vairiot_api node -e "
  fetch('http://127.0.0.1:3001/health/ready')
    .then(async (r) => { console.log(r.status, await r.text()); process.exit(r.ok ? 0 : 1); })
    .catch((e) => { console.log('error', e.message); process.exit(1); });
" 2>&1)" || die "/health/ready failed: ${READY}"
echo "  ✓ ${READY}"

# TLS renewal: certbot must reload nginx after renewing, or a renewed
# certificate is not served until the next restart.
HOOK_DIR=/etc/letsencrypt/renewal-hooks/deploy
HOOK="${HOOK_DIR}/vairiot-reload-nginx.sh"
if [ -d "$HOOK_DIR" ] && ! cmp -s "${REPO_DIR}/infra/certbot/reload-nginx.sh" "$HOOK"; then
  if install -m 755 "${REPO_DIR}/infra/certbot/reload-nginx.sh" "$HOOK" 2>/dev/null; then
    echo "→ Installed certbot renewal hook: $HOOK"
  else
    echo "⚠  Could not install the certbot renewal hook (needs root). Run once:"
    echo "     sudo install -m 755 ${REPO_DIR}/infra/certbot/reload-nginx.sh $HOOK"
  fi
fi

echo "→ Container status:"
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

echo
echo "✅ Deploy complete."
