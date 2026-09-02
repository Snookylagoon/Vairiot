#!/usr/bin/env bash
# Run the vairiot-api test suite against a throwaway database.
#
#   ./scripts/test-api.sh                 # whole suite
#   ./scripts/test-api.sh auth            # only paths matching "auth"
#   KEEP_UP=1 ./scripts/test-api.sh       # leave the containers running
#
# Why this exists: the suite is integration-heavy. Every test opens a real
# Prisma client and seeds the tenant and licence it needs, so it needs a
# database — and must never be pointed at one that matters. On 2 Sep 2026 it
# was run against the staging database by mistake; nothing was lost, but the
# suite contains tenant-delete tests and that was luck rather than design.
# This gives it a Postgres of its own that is destroyed on exit.
#
# The steps mirror the test-api job in .github/workflows/ci.yml. Keep them in
# step: the point is that a green run here means a green run there.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

COMPOSE="docker compose -f infra/docker-compose.test.yml"
export DATABASE_URL='postgresql://vairiot_test:testpassword@127.0.0.1:55432/vairiot_test'
export REDIS_URL='redis://127.0.0.1:56379'
# Test-only values. Real secrets never appear here, and NODE_ENV=test keeps the
# app off any code path that expects production configuration.
export JWT_SECRET='local-test-secret-not-for-production-32ch'
export JWT_REFRESH_SECRET='local-test-refresh-not-for-production-32'
export APP_ENCRYPTION_KEY='local-test-encryption-key-32-chars!!'
export NODE_ENV=test

if ! docker info >/dev/null 2>&1; then
  echo "❌ Docker is not running. Start Docker Desktop and try again." >&2
  exit 1
fi

cleanup() {
  if [ "${KEEP_UP:-}" = "1" ]; then
    echo ""
    echo "→ KEEP_UP=1, leaving the stack up. Stop it with:"
    echo "    $COMPOSE down -v"
  else
    echo ""
    echo "→ Tearing down the throwaway stack…"
    $COMPOSE down -v >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "▶ 1/4 Starting throwaway Postgres + Redis…"
# down -v first so a half-dead stack from a previous run can't be reused.
$COMPOSE down -v >/dev/null 2>&1 || true
$COMPOSE up -d --wait
echo "✅ Up: postgres on 127.0.0.1:55432, redis on 127.0.0.1:56379 (both ephemeral)"
echo ""

echo "▶ 2/4 Building vairiot-shared…"
# The api's tests import services that import vairiot-shared, so its dist/ has
# to exist first — same reason CI builds it before running the suite.
npm run build --workspace vairiot-shared >/dev/null
echo "✅ Built"
echo ""

echo "▶ 3/4 Applying the schema to the throwaway database…"
( cd vairiot-api && npx prisma migrate deploy )
echo ""

echo "▶ 4/4 Running the suite…"
# --forceExit because the suite leaks open handles: Prisma, Redis and BullMQ
# are not closed in teardown, so jest finishes every test and then hangs. CI
# passes the same flag for the same reason, with a 15-minute backstop. Fixing
# teardown so this isn't needed is a known follow-up — until then, without it
# a local run looks like it has hung when it has actually passed.
cd vairiot-api
if [ $# -gt 0 ]; then
  npx jest --runInBand --forceExit "$@"
else
  npx jest --runInBand --coverage --forceExit
fi
