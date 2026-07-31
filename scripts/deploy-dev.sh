#!/usr/bin/env bash
# Deploy your work-in-progress to the TEST site (https://test.vairiot.com).
#
# Run from the Vairiot-dev folder:
#   ./scripts/deploy-dev.sh "short description of what you changed"
#
# What it does:
#   1. Commits everything you've changed (with your message)
#   2. Pushes the dev branch to GitHub
#   3. Tells the test server to pull + rebuild (infra/deploy.sh)
#   4. Checks the test site is answering
#
# Nothing here can touch the live site — that only happens via scripts/go-live.sh.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

BRANCH="$(git branch --show-current)"
if [ "$BRANCH" != "dev" ]; then
  echo "ERROR: you are on branch '$BRANCH', not 'dev'." >&2
  echo "Fix with:  git checkout dev" >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  MSG="${1:-}"
  if [ -z "$MSG" ]; then
    echo "You have uncommitted changes. Give them a short description, e.g.:" >&2
    echo "  ./scripts/deploy-dev.sh \"add asset export button\"" >&2
    exit 1
  fi
  echo "→ Committing your changes…"
  git add -A
  git commit -m "$MSG"
else
  echo "→ No new changes to commit — deploying what's already committed."
fi

echo "→ Pushing dev branch to GitHub…"
git push origin dev

echo "→ Deploying to the test server (this rebuilds containers, takes a few minutes)…"
ssh vairiot-dev 'bash /opt/Vairiot/infra/deploy.sh'

echo "→ Checking the test site is up…"
sleep 5
if curl -fsS --max-time 30 https://test.vairiot.com/health/ready >/dev/null; then
  echo
  echo "✅ Deployed. Check your change at:  https://test.vairiot.com"
  echo "   Admin panel:                    https://testadmin.vairiot.com"
else
  echo
  echo "⚠️  Deploy finished but the health check failed." >&2
  echo "   Wait 30 seconds and open https://test.vairiot.com — if it's broken, run:" >&2
  echo "   ssh vairiot-dev 'docker ps && docker logs --tail 50 vairiot_api'" >&2
  exit 1
fi
