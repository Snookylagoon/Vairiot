#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Vairiot off-host backup — Postgres + MinIO + Redis + secrets.
#
# Runs on the prod server and reads the same repo-root .env the deploy uses.
# Produces one timestamped archive, encrypted with age, and copies it to
# S3-compatible storage off the host. Keeps 30 daily and 12 monthly copies.
#
#   Manual run:   bash /opt/Vairiot/infra/backup.sh
#   Cron (daily): see infra/backup.crontab
#   Verify:       bash /opt/Vairiot/infra/restore-test.sh   (monthly, see DEPLOY.md)
#
# Settings (in .env, or the environment):
#   BACKUP_AGE_RECIPIENT     age public key (age1…). The archive contains .env,
#                            so without it nothing is sent off-host.
#   BACKUP_S3_ENDPOINT       e.g. https://s3.eu-central-003.backblazeb2.com
#   BACKUP_S3_BUCKET         bucket name
#   BACKUP_S3_ACCESS_KEY / BACKUP_S3_SECRET_KEY
#   BACKUP_S3_REGION         optional (some providers require it)
#   BACKUP_S3_PREFIX         optional folder in the bucket (default: vairiot)
#   BACKUP_REMOTE_TARGET     alternative to BACKUP_S3_*: an rclone remote:path
#   BACKUP_DIR               local archive folder (default /opt/Vairiot/backups)
#   BACKUP_DAILY_DAYS        off-host daily retention (default 30)
#   BACKUP_MONTHLY_DAYS      off-host monthly retention (default 366 ≈ 12 copies)
#   BACKUP_LOCAL_DAYS        local retention (default 7 with off-host, 30 without)
#   BACKUP_ALLOW_UNENCRYPTED=1  accept an unencrypted archive (not recommended)
#
# Exit codes: 0 = complete; 1 = failed; 2 = archive made but incomplete
# (unencrypted and/or not off-host). Every non-zero exit logs a
# [BACKUP-FAILED] or [BACKUP-INCOMPLETE] line for log-based alerting.
# ---------------------------------------------------------------------------
set -euo pipefail
umask 077  # the archive and its staging folder hold secrets

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${REPO_DIR}/.env}"

log()  { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
fail() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [BACKUP-FAILED] $*" >&2; exit 1; }

[ -f "$ENV_FILE" ] || fail "env file not found: $ENV_FILE"
set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

: "${POSTGRES_USER:?POSTGRES_USER missing from env}"
: "${POSTGRES_DB:?POSTGRES_DB missing from env}"
: "${MINIO_ROOT_USER:?MINIO_ROOT_USER missing from env}"
: "${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD missing from env}"

BACKUP_DIR="${BACKUP_DIR:-/opt/Vairiot/backups}"
AGE_RECIPIENT="${BACKUP_AGE_RECIPIENT:-}"
DAILY_DAYS="${BACKUP_DAILY_DAYS:-30}"
MONTHLY_DAYS="${BACKUP_MONTHLY_DAYS:-366}"
PG_CONTAINER="${PG_CONTAINER:-vairiot_postgres}"
MINIO_CONTAINER="${MINIO_CONTAINER:-vairiot_minio}"
REDIS_CONTAINER="${REDIS_CONTAINER:-vairiot_redis}"
BUCKETS=(vairiot-photos vairiot-documents vairiot-mobile-releases)

# Off-host target: S3-compatible settings, or a pre-configured rclone remote.
REMOTE=""
if [ -n "${BACKUP_S3_ENDPOINT:-}" ] && [ -n "${BACKUP_S3_BUCKET:-}" ]; then
    : "${BACKUP_S3_ACCESS_KEY:?BACKUP_S3_ACCESS_KEY missing}"
    : "${BACKUP_S3_SECRET_KEY:?BACKUP_S3_SECRET_KEY missing}"
    # On-the-fly rclone S3 backend. Credentials go through the environment so
    # they never appear in the process list.
    export RCLONE_CONFIG=/dev/null  # every setting comes from the environment
    export RCLONE_S3_PROVIDER=Other
    export RCLONE_S3_ENDPOINT="$BACKUP_S3_ENDPOINT"
    export RCLONE_S3_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY"
    export RCLONE_S3_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_KEY"
    [ -n "${BACKUP_S3_REGION:-}" ] && export RCLONE_S3_REGION="$BACKUP_S3_REGION"
    REMOTE=":s3:${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX:-vairiot}"
elif [ -n "${BACKUP_REMOTE_TARGET:-}" ]; then
    REMOTE="$BACKUP_REMOTE_TARGET"
fi
if [ -n "$REMOTE" ]; then LOCAL_DAYS="${BACKUP_LOCAL_DAYS:-7}"; else LOCAL_DAYS="${BACKUP_LOCAL_DAYS:-30}"; fi

command -v docker >/dev/null || fail "docker not on PATH"
[ -z "$AGE_RECIPIENT" ] || command -v age >/dev/null || fail "BACKUP_AGE_RECIPIENT set but 'age' is not installed"
[ -z "$REMOTE" ] || command -v rclone >/dev/null || fail "off-host target set but 'rclone' is not installed"

STAMP="$(date -u +%Y%m%d-%H%M%S)"
MONTH="$(date -u +%Y%m)"
NAME="vairiot-backup-${STAMP}"
mkdir -p "$BACKUP_DIR"
WORK="${BACKUP_DIR}/tmp-${STAMP}"
mkdir -p "$WORK"
trap 'rm -rf "$WORK"' EXIT
MANIFEST="${WORK}/manifest.txt"

psql_q() {
    docker exec -e PGPASSWORD="${POSTGRES_PASSWORD:-}" "$PG_CONTAINER" \
        psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -v ON_ERROR_STOP=1 -c "$1"
}

# Exact row count of every table in the public schema, as "table|count" lines.
table_counts() {
    local sql
    sql="$(psql_q "SELECT string_agg(format('SELECT %L, count(*) FROM %I.%I', table_name, table_schema, table_name), ' UNION ALL ' ORDER BY table_name) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'")"
    [ -n "$sql" ] && psql_q "$sql"
}

# Object count per bucket, as "bucket|count" lines (-1 = bucket missing).
object_counts() {
    docker exec "$MINIO_CONTAINER" sh -c '
        mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1 || exit 1
        for b in '"${BUCKETS[*]}"'; do
            if mc ls "local/$b" >/dev/null 2>&1; then
                echo "$b|$(mc ls --recursive "local/$b" | wc -l | tr -d " ")"
            else
                echo "$b|-1"
            fi
        done'
}

{
    echo "format=2"
    echo "created=${STAMP}"
    echo "commit=$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"
    echo "postgres_db=${POSTGRES_DB}"
} > "$MANIFEST"

# ----- 1. Postgres (custom format, compressed) -----------------------------
# Row counts are taken just before and just after the dump; restore-test.sh
# checks that each restored table lands between the two (writes during the
# dump make an exact match impossible without holding a snapshot open).
log "Counting rows…"
table_counts > "${WORK}/rows-before.txt" || fail "row count (before) failed"
log "Dumping Postgres database '${POSTGRES_DB}'…"
docker exec -e PGPASSWORD="${POSTGRES_PASSWORD:-}" "$PG_CONTAINER" \
    pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc \
    > "${WORK}/postgres-${POSTGRES_DB}.dump" \
    || fail "pg_dump failed"
table_counts > "${WORK}/rows-after.txt" || fail "row count (after) failed"
join -t'|' <(sort "${WORK}/rows-before.txt") <(sort "${WORK}/rows-after.txt") \
    | sed 's/^/rows|/' >> "$MANIFEST"
rm -f "${WORK}/rows-before.txt" "${WORK}/rows-after.txt"
log "  → $(du -h "${WORK}/postgres-${POSTGRES_DB}.dump" | cut -f1), $(grep -c '^rows|' "$MANIFEST") tables"

# ----- 2. MinIO buckets ----------------------------------------------------
# The MinIO image ships no tar, so the tree is copied out and archived here.
# A bucket that exists but fails to mirror fails the backup (it used to be
# silently skipped).
log "Mirroring MinIO buckets…"
object_counts > "${WORK}/objects-before.txt" || fail "MinIO object count failed"
docker exec "$MINIO_CONTAINER" sh -c '
    set -e
    mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
    rm -rf /tmp/minio-backup && mkdir -p /tmp/minio-backup
    for b in '"${BUCKETS[*]}"'; do
        mc ls "local/$b" >/dev/null 2>&1 || { echo "  (bucket $b does not exist — skipped)"; continue; }
        mkdir -p "/tmp/minio-backup/$b"
        mc mirror --overwrite --quiet "local/$b" "/tmp/minio-backup/$b" >/dev/null || { echo "mirror of $b failed" >&2; exit 1; }
    done
' || fail "MinIO mirror failed"
object_counts > "${WORK}/objects-after.txt" || fail "MinIO object count failed"
join -t'|' <(sort "${WORK}/objects-before.txt") <(sort "${WORK}/objects-after.txt") \
    | sed 's/^/objects|/' >> "$MANIFEST"
rm -f "${WORK}/objects-before.txt" "${WORK}/objects-after.txt"
docker cp "${MINIO_CONTAINER}:/tmp/minio-backup" "${WORK}/minio-backup" || fail "copying MinIO data out failed"
docker exec "$MINIO_CONTAINER" rm -rf /tmp/minio-backup || true
tar -C "${WORK}/minio-backup" -czf "${WORK}/minio.tgz" . || fail "packaging MinIO archive failed"
rm -rf "${WORK}/minio-backup"
log "  → $(du -h "${WORK}/minio.tgz" | cut -f1)"

# ----- 3. Redis (RDB snapshot) ---------------------------------------------
# Holds BullMQ queues (pending emails, webhook deliveries) and the JWT
# blacklist. Optional to restore, but cheap to keep.
log "Snapshotting Redis…"
redis_cli() { docker exec "$REDIS_CONTAINER" redis-cli -a "${REDIS_PASSWORD:-}" --no-auth-warning "$@"; }
before_save="$(redis_cli LASTSAVE)" || fail "Redis not reachable"
redis_cli BGSAVE >/dev/null 2>&1 || true   # "already in progress" is fine: wait for it below
for _ in $(seq 1 120); do
    [ "$(redis_cli LASTSAVE)" != "$before_save" ] && break
    sleep 1
done
[ "$(redis_cli LASTSAVE)" != "$before_save" ] || fail "Redis BGSAVE did not complete within 120s"
docker cp "${REDIS_CONTAINER}:/data/dump.rdb" "${WORK}/redis.rdb" || fail "copying Redis snapshot failed"
echo "redis_keys=$(redis_cli DBSIZE)" >> "$MANIFEST"
log "  → $(du -h "${WORK}/redis.rdb" | cut -f1)"

# ----- 4. Secrets (.env holds JWT_SECRET + APP_ENCRYPTION_KEY) --------------
# Losing APP_ENCRYPTION_KEY orphans the encrypted SMTP credentials even with a
# good database dump, so the env travels with the backup (encrypted below).
cp "$ENV_FILE" "${WORK}/env.snapshot"

# ----- 5. Package and encrypt ----------------------------------------------
# Streamed straight into age, so no unencrypted archive is written.
INCOMPLETE=""
if [ -n "$AGE_RECIPIENT" ]; then
    ARCHIVE="${BACKUP_DIR}/${NAME}.tar.age"
    tar -C "$WORK" -cf - . | age -r "$AGE_RECIPIENT" -o "$ARCHIVE" \
        || { rm -f "$ARCHIVE"; fail "encryption failed (check BACKUP_AGE_RECIPIENT)"; }
else
    ARCHIVE="${BACKUP_DIR}/${NAME}.tar"
    tar -C "$WORK" -cf "$ARCHIVE" .
    if [ "${BACKUP_ALLOW_UNENCRYPTED:-}" != "1" ]; then
        INCOMPLETE="archive is UNENCRYPTED (set BACKUP_AGE_RECIPIENT); kept locally (mode 600) and NOT sent off-host"
    fi
fi
log "Archive: ${ARCHIVE} ($(du -h "$ARCHIVE" | cut -f1))"

# ----- 6. Off-host copy: daily/, plus monthly/ for the month's first ---------
if [ -z "$REMOTE" ]; then
    INCOMPLETE="${INCOMPLETE:+$INCOMPLETE; }no off-host target (set BACKUP_S3_* or BACKUP_REMOTE_TARGET) — a lost host loses every backup"
elif [ -n "$INCOMPLETE" ]; then
    log "Skipping off-host copy: the archive is not encrypted."
else
    FILE="$(basename "$ARCHIVE")"
    log "Uploading to ${REMOTE}/daily/…"
    rclone copyto "$ARCHIVE" "${REMOTE}/daily/${FILE}" || fail "off-host upload failed"
    if [ -z "$(rclone lsf "${REMOTE}/monthly/" --include "vairiot-backup-${MONTH}*" 2>/dev/null || true)" ]; then
        log "First backup of ${MONTH}: keeping a monthly copy."
        rclone copyto "${REMOTE}/daily/${FILE}" "${REMOTE}/monthly/${FILE}" || fail "monthly copy failed"
    fi
    rclone delete "${REMOTE}/daily/" --min-age "${DAILY_DAYS}d" --include 'vairiot-backup-*' || log "WARNING: pruning daily copies failed"
    rclone delete "${REMOTE}/monthly/" --min-age "${MONTHLY_DAYS}d" --include 'vairiot-backup-*' || log "WARNING: pruning monthly copies failed"
    # Archives from before daily/monthly folders sat at the top level.
    rclone delete "${REMOTE}/" --max-depth 1 --min-age "${DAILY_DAYS}d" --include 'vairiot-backup-*' 2>/dev/null || true
    log "Off-host copy complete."
fi

# ----- 7. Prune local ------------------------------------------------------
find "$BACKUP_DIR" -maxdepth 1 -name 'vairiot-backup-*' -type f -mtime "+${LOCAL_DAYS}" -delete 2>/dev/null || true

if [ -n "$INCOMPLETE" ]; then
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [BACKUP-INCOMPLETE] $(basename "$ARCHIVE"): ${INCOMPLETE}" >&2
    exit 2
fi
log "Backup OK: $(basename "$ARCHIVE")"
