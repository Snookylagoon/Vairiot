#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# One-time local set-up for Vairiot Asset Intelligence.
#
#   bash scripts/dev-setup.sh           create .env from .env.example (if absent)
#   bash scripts/dev-setup.sh --force   regenerate .env (destroys the old secrets; run
#                                       `docker compose -f infra/docker-compose.yml down -v`
#                                       first, because existing volumes keep the old passwords)
#
# Every `change-me-…` placeholder in .env.example is replaced with a fresh
# random value from `openssl rand`. The same placeholder gets the same value
# everywhere, so DATABASE_URL matches POSTGRES_PASSWORD. Seed passwords get
# upper case, lower case and digits for the password policy. No secret is ever
# printed: read .env when you need one. Adapted from Vairiot CI.
# ---------------------------------------------------------------------------
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="${ROOT}/.env.example"
# DEV_SETUP_ENV_FILE writes elsewhere (used to test this script).
TARGET="${DEV_SETUP_ENV_FILE:-${ROOT}/.env}"
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 64 ;;
  esac
done

command -v openssl >/dev/null || { echo "openssl is required" >&2; exit 1; }
[[ -f "$TEMPLATE" ]] || { echo "Missing $TEMPLATE" >&2; exit 1; }

if [[ -f "$TARGET" && "$FORCE" -eq 0 ]]; then
  echo ".env already exists; keeping it (use --force to regenerate)."
  exit 0
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
script="${work}/replace.sed"
: > "$script"
# Longest placeholders first, so none is replaced inside a longer one.
grep -o 'change-me-[a-z0-9-]*' "$TEMPLATE" | sort -u | awk '{ print length, $0 }' \
  | sort -rn | cut -d' ' -f2- | while IFS= read -r token; do
    case "$token" in
      change-me-seed-*)
        value="Va$(openssl rand -hex 12)$(openssl rand -base64 12 | tr -dc 'A-Z' | head -c 4)7"
        ;;
      *)
        value="$(openssl rand -hex 32)"
        ;;
    esac
    printf 's/%s/%s/g\n' "$token" "$value" >> "$script"
  done
sed -f "$script" "$TEMPLATE" > "${work}/env"
if grep -q 'change-me-' "${work}/env"; then
  echo "Placeholder replacement failed; .env not written." >&2
  exit 1
fi
mv "${work}/env" "$TARGET"
chmod 600 "$TARGET"
echo "Wrote ${TARGET#"${ROOT}/"} with newly generated secrets (mode 600)."
echo "Start the stack with: docker compose --env-file .env -f infra/docker-compose.yml up"
