#!/usr/bin/env bash
# Promote everything on the dev branch to the LIVE site (https://vai.vairiot.com).
#
# Run from either the Vairiot or Vairiot-dev folder:
#   ./scripts/go-live.sh
#
# What it does:
#   1. Asks you to confirm (type: live)
#   2. Opens (or reuses) a pull request dev → main on GitHub
#   3. Waits for the required CI checks, then merges it. main is protected
#      (ruleset "Protect main"): it only takes merged pull requests whose
#      checks passed, so a failing check stops the release here, before
#      anything reaches the server. The pull request stays open to fix.
#   4. Brings dev up to date with main
#   5. Tells the PRODUCTION server to pull + rebuild (infra/deploy.sh)
#   6. Checks the live site is answering
#
# Needs the GitHub CLI, logged in (`gh auth status`).
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

gh auth status >/dev/null 2>&1 || {
  echo "ERROR: the GitHub CLI is not logged in. Run: gh auth login" >&2
  exit 1
}

START_BRANCH="$(git branch --show-current)"

echo "→ Fetching latest from GitHub…"
git fetch origin

if [ -z "$(git rev-list origin/main..origin/dev)" ]; then
  echo "Nothing to release: main already has everything on dev."
  exit 0
fi

PR="$(gh pr list --base main --head dev --state open --json number -q '.[0].number')"
if [ -n "$PR" ]; then
  echo "→ Using the open release pull request #${PR}…"
else
  echo "→ Opening a pull request dev → main…"
  gh pr create --base main --head dev \
    --title "release: promote dev to production" \
    --body "$(printf 'Opened by scripts/go-live.sh.\n\nCommits:\n\n'; git log --no-merges --format='- %s' origin/main..origin/dev)" >/dev/null
  PR="$(gh pr list --base main --head dev --state open --json number -q '.[0].number')"
fi
PR_URL="$(gh pr view "$PR" --json url -q .url)"
echo "  ${PR_URL}"

# The commit whose checks we wait for; the merge below refuses anything else,
# so a push to dev during the wait can't reach main unchecked.
HEAD_SHA="$(gh pr view "$PR" --json headRefOid -q .headRefOid)"

# Checks take a moment to register on a new pull request.
echo "→ Waiting for the CI checks (usually 5–10 minutes)…"
for _ in $(seq 1 30); do
  [ "$(gh pr view "$PR" --json statusCheckRollup -q '.statusCheckRollup | length')" -gt 0 ] && break
  sleep 10
done
if ! gh pr checks "$PR" --required --watch --fail-fast --interval 20; then
  echo >&2
  echo "❌ A required check failed — nothing was merged or deployed; the live site is unchanged." >&2
  echo "   Fix it on dev; the pull request picks up new commits. Details: ${PR_URL}" >&2
  exit 1
fi

echo "→ Merging pull request #${PR} into main…"
gh pr merge "$PR" --merge --match-head-commit "$HEAD_SHA" \
  --subject "release: promote dev to production (#${PR})" || {
  echo "❌ Merge refused (dev changed while the checks ran?) — nothing deployed. Run go-live.sh again." >&2
  exit 1
}
git fetch origin

echo "→ Bringing dev up to date with main…"
git checkout dev
git pull --ff-only origin dev
git merge --ff-only origin/main 2>/dev/null \
  || git merge --no-edit -m "chore: sync dev with main after release" origin/main
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
