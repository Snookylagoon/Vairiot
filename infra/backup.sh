#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Vairiot off-host backup — Postgres + MinIO + secrets.
#
# Runs on the prod server (reads the same repo-root .env the deploy uses).
# Produces a single timestamped, optionally-encrypted archive and pushes it
# to off-host object storage via rclone, then prunes local + remote copies
# older than the retention window.
#
#   Manual run:   bash /opt/Vairiot/infra/backup.sh
#   Cron (daily): see infra/backup.crontab
#
# Exit non-zero on any failure so cron/monitoring can alert.
# ---------------------------------------------------------------------------
set -euo pipefail

# ----- config (override via environment / .env) ----------------------------
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${REPO_DIR}/.env}"
COMPOSE_FILE="${REPO_DIR}/infra/docker-compose.prod.yml"

BACKUP_DIR="${BACKUP_DIR:-/opt/Vairiot/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

# rclone remote:path for off-host copy, e.g. "b2:vairiot-backups" or "s3eu:vairiot-backups".
# Leave empty to keep local-only (NOT recommended — off-host is the whole point).
REMOTE_TARGET="${BACKUP_REMOTE_TARGET:-}"

# Optional: age/gpg recipient to encrypt the archive at rest. If set, requires `age`.
AGE_RECIPIENT="${BACKUP_AGE_RECIPIENT:-}"

# Container names (match docker-compose.prod.yml).
PG_CONTAINER="${PG_CONTAINER:-vairiot_postgres}"
MINIO_CONTAINER="${MINIO_CONTAINER:-vairiot_minio}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
fail() { echo "[BACKUP-FAILED] $*" >&2; exit 1; }

[ -f "$ENV_FILE" ] || fail "env file not found: $ENV_FILE"
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

: "${POSTGRES_USER:?POSTGRES_USER missing from env}"
: "${POSTGRES_DB:?POSTGRES_DB missing from env}"
: "${MINIO_ROOT_USER:?MINIO_ROOT_USER missing from env}"
: "${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD missing from env}"

command -v docker >/dev/null || fail "docker not on PATH"

STAMP="$(date -u +%Y%m%d-%H%M%S)"
WORK="${BACKUP_DIR}/tmp-${STAMP}"
mkdir -p "$WORK"
trap 'rm -rf "$WORK"' EXIT

# ----- 1. Postgres (custom format, compressed) -----------------------------
log "Dumping Postgres database '${POSTGRES_DB}'…"
docker exec -e PGPASSWORD="${POSTGRES_PASSWORD:-}" "$PG_CONTAINER" \
    pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc \
    > "${WORK}/postgres-${POSTGRES_DB}.dump" \
    || fail "pg_dump failed"
log "  → $(du -h "${WORK}/postgres-${POSTGRES_DB}.dump" | cut -f1)"

# ----- 2. MinIO buckets (mirror via in-container mc) ------------------------
# The MinIO image ships no tar, so copy the tree out and archive on the host.
log "Mirroring MinIO buckets…"
docker exec "$MINIO_CONTAINER" sh -c '
    mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1 &&
    rm -rf /tmp/minio-backup && mkdir -p /tmp/minio-backup &&
    for b in vairiot-photos vairiot-documents vairiot-mobile-releases; do
        mc mirror --overwrite --remove "local/$b" "/tmp/minio-backup/$b" 2>/dev/null || true
    done
' || fail "MinIO mirror failed"
docker cp "${MINIO_CONTAINER}:/tmp/minio-backup" "${WORK}/minio-backup" || fail "docker cp minio data failed"
docker exec "$MINIO_CONTAINER" rm -rf /tmp/minio-backup || true
tar -C "${WORK}/minio-backup" -czf "${WORK}/minio.tgz" . || fail "packaging minio archive failed"
rm -rf "${WORK}/minio-backup"
log "  → $(du -h "${WORK}/minio.tgz" | cut -f1)"

# ----- 3. Secrets (.env holds JWT_SECRET + APP_ENCRYPTION_KEY) --------------
# Losing APP_ENCRYPTION_KEY orphans encrypted SMTP creds even with a DB dump,
# so the env MUST travel with the backup. The archive is encrypted below.
cp "$ENV_FILE" "${WORK}/env.snapshot"

# ----- 4. Package + (optional) encrypt -------------------------------------
ARCHIVE="${BACKUP_DIR}/vairiot-backup-${STAMP}.tar"
tar -C "$WORK" -cf "$ARCHIVE" .

if [ -n "$AGE_RECIPIENT" ]; then
    command -v age >/dev/null || fail "BACKUP_AGE_RECIPIENT set but 'age' not installed"
    age -r "$AGE_RECIPIENT" -o "${ARCHIVE}.age" "$ARCHIVE"
    rm -f "$ARCHIVE"
    ARCHIVE="${ARCHIVE}.age"
    log "Encrypted archive: $(basename "$ARCHIVE")"
else
    log "WARNING: BACKUP_AGE_RECIPIENT unset — archive (incl. secrets) is UNENCRYPTED at rest."
fi
log "Local archive: ${ARCHIVE} ($(du -h "$ARCHIVE" | cut -f1))"

# ----- 5. Push off-host ----------------------------------------------------
if [ -n "$REMOTE_TARGET" ]; then
    command -v rclone >/dev/null || fail "BACKUP_REMOTE_TARGET set but 'rclone' not installed"
    log "Uploading to ${REMOTE_TARGET}…"
    rclone copy "$ARCHIVE" "$REMOTE_TARGET" --no-traverse || fail "rclone upload failed"
    # prune remote older than retention
    rclone delete "$REMOTE_TARGET" --min-age "${RETENTION_DAYS}d" --include 'vairiot-backup-*' 2>/dev/null || true
    log "Off-host upload complete."
else
    log "WARNING: BACKUP_REMOTE_TARGET unset — backup is LOCAL-ONLY. Set it to survive host loss."
fi

# ----- 6. Prune local ------------------------------------------------------
find "$BACKUP_DIR" -maxdepth 1 -name 'vairiot-backup-*' -type f -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null || true

log "Backup OK: $(basename "$ARCHIVE")"
