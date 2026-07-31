#!/usr/bin/env bash
# Promote everything on the dev branch to the LIVE site (https://vai.vairiot.com).
#
# Run from either the Vairiot or Vairiot-dev folder:
#   ./scripts/go-live.sh
#
# What it does:
#   1. Asks you to confirm (type: live)
#   2. Merges the dev branch into main and pushes to GitHub
#   3. Tells the PRODUCTION server to pull + rebuild (infra/deploy.sh)
#   4. Checks the live site is answering
#
# Only run this after you have tested your changes on https://test.vairiot.com.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: you have uncommitted changes in this folder." >&2
  echo "Deploy them to the test site first:  ./scripts/deploy-dev.sh \"message\"" >&2
  exit 1
fi

echo "This will put everything currently on the dev branch onto the LIVE site."
echo "Live site: https://vai.vairiot.com"
printf 'Type "live" to continue, anything else to cancel: '
read -r ANSWER
if [ "$ANSWER" != "live" ]; then
  echo "Cancelled — nothing was changed."
  exit 0
fi

START_BRANCH="$(git branch --show-current)"

echo "→ Fetching latest from GitHub…"
git fetch origin

echo "→ Merging dev into main…"
git checkout main
git pull --ff-only origin main
git merge --no-ff origin/dev -m "release: promote dev to production"
git push origin main

echo "→ Bringing dev up to date with main…"
git checkout dev
git pull --ff-only origin dev
git merge --ff main -m "chore: sync dev with main after release" || git merge main -m "chore: sync dev with main after release"
git push origin dev

# go back to whatever branch you started on
git checkout "$START_BRANCH"

echo "→ Deploying to the PRODUCTION server (takes a few minutes)…"
ssh vairiot 'bash /opt/Vairiot/infra/deploy.sh'

echo "→ Checking the live site is up…"
sleep 5
if curl -fsS --max-time 30 https://vai.vairiot.com/health/ready >/dev/null; then
  echo
  echo "✅ LIVE. Your changes are now on:  https://vai.vairiot.com"
else
  echo
  echo "⚠️  Deploy finished but the health check failed." >&2
  echo "   Wait 30 seconds and open https://vai.vairiot.com — if it's broken, run:" >&2
  echo "   ssh vairiot 'docker ps && docker logs --tail 50 vairiot_api'" >&2
  exit 1
fi
