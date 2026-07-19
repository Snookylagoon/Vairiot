#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Vairiot restore — inverse of backup.sh.
#
#   bash /opt/Vairiot/infra/restore.sh /path/to/vairiot-backup-YYYYMMDD-HHMMSS.tar[.age]
#
# Restores Postgres and MinIO from a backup archive. Prints the .env snapshot
# path for manual review — it is NOT auto-applied (you must reconcile secrets
# by hand so a stale JWT_SECRET/APP_ENCRYPTION_KEY can't silently clobber prod).
#
# DESTRUCTIVE: overwrites the current database and bucket contents. Requires an
# explicit CONFIRM=yes to proceed.
# ---------------------------------------------------------------------------
set -euo pipefail

ARCHIVE="${1:-}"
[ -n "$ARCHIVE" ] && [ -f "$ARCHIVE" ] || { echo "usage: restore.sh <archive.tar[.age]>" >&2; exit 1; }
[ "${CONFIRM:-}" = "yes" ] || { echo "Refusing to run without CONFIRM=yes (this overwrites prod data)." >&2; exit 1; }

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${REPO_DIR}/.env}"
set -a; source "$ENV_FILE"; set +a

PG_CONTAINER="${PG_CONTAINER:-vairiot_postgres}"
MINIO_CONTAINER="${MINIO_CONTAINER:-vairiot_minio}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# ----- unpack (decrypt if .age) --------------------------------------------
if [[ "$ARCHIVE" == *.age ]]; then
    : "${BACKUP_AGE_IDENTITY:?set BACKUP_AGE_IDENTITY to your age private-key file to decrypt}"
    age -d -i "$BACKUP_AGE_IDENTITY" "$ARCHIVE" | tar -C "$WORK" -xf -
else
    tar -C "$WORK" -xf "$ARCHIVE"
fi

echo "→ Restoring Postgres…"
DUMP="$(find "$WORK" -name 'postgres-*.dump' | head -1)"
[ -n "$DUMP" ] || { echo "no postgres dump in archive" >&2; exit 1; }
docker exec -i -e PGPASSWORD="${POSTGRES_PASSWORD:-}" "$PG_CONTAINER" \
    pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner < "$DUMP"

echo "→ Restoring MinIO buckets…"
docker cp "${WORK}/minio.tgz" "${MINIO_CONTAINER}:/tmp/minio-restore.tgz"
docker exec "$MINIO_CONTAINER" sh -c '
    mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1 &&
    rm -rf /tmp/minio-restore && mkdir -p /tmp/minio-restore &&
    tar -C /tmp/minio-restore -xzf /tmp/minio-restore.tgz &&
    for b in vairiot-photos vairiot-documents vairiot-mobile-releases; do
        mc mb --ignore-existing "local/$b" >/dev/null 2>&1 || true
        [ -d "/tmp/minio-restore/$b" ] && mc mirror --overwrite "/tmp/minio-restore/$b" "local/$b"
    done &&
    rm -rf /tmp/minio-restore /tmp/minio-restore.tgz
'

echo
echo "✅ Postgres + MinIO restored."
echo "⚠  Secrets snapshot extracted to: ${WORK}/env.snapshot (copied below, WORK dir is cleaned on exit)"
cp "${WORK}/env.snapshot" "${REPO_DIR}/.env.restored" 2>/dev/null || true
echo "   Review ${REPO_DIR}/.env.restored against your live .env — in particular"
echo "   APP_ENCRYPTION_KEY must match the one that encrypted the SMTP creds in this dump."
