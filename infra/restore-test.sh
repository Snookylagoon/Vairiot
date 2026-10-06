#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Vairiot restore test — proves the latest backup can actually be restored.
#
#   bash /opt/Vairiot/infra/restore-test.sh                 # newest backup
#   bash /opt/Vairiot/infra/restore-test.sh <archive>       # a specific one
#
# Restores into a throwaway compose project (vairiot-restoretest, see
# docker-compose.restoretest.yml) and never touches the prod containers.
# Checks:
#   1. the archive decrypts and contains every part;
#   2. pg_restore completes;
#   3. `prisma migrate status` finds the schema up to date with this checkout;
#   4. every table's restored row count matches the count taken at backup time;
#   5. every MinIO bucket's file count matches the backup-time object count;
#   6. the Redis snapshot loads.
# Then tears the stack down. Exit 0 = restorable; non-zero = investigate
# (a [RESTORE-TEST-FAILED] line says why). Run monthly (DEPLOY.md).
#
# Which backup: the newest one off-host if BACKUP_S3_* or BACKUP_REMOTE_TARGET
# is set (that's the copy that matters when the host is gone), else the newest
# in BACKUP_DIR. Encrypted archives need BACKUP_AGE_IDENTITY (path to the age
# private key).
# ---------------------------------------------------------------------------
set -euo pipefail
umask 077

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${REPO_DIR}/.env}"
COMPOSE=(docker compose --progress quiet -p vairiot-restoretest -f "${REPO_DIR}/infra/docker-compose.restoretest.yml")

log()  { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
fail() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [RESTORE-TEST-FAILED] $*" >&2; exit 1; }

if [ -f "$ENV_FILE" ]; then
        set -a
        # shellcheck source=/dev/null
        source "$ENV_FILE"
        set +a
fi
BACKUP_DIR="${BACKUP_DIR:-/opt/Vairiot/backups}"

WORK="$(mktemp -d)"
cleanup() {
    "${COMPOSE[@]}" --profile tools down -v --remove-orphans >/dev/null 2>&1 || true
    rm -rf "$WORK"
}
trap cleanup EXIT

# ----- 1. Find and unpack the archive --------------------------------------
ARCHIVE="${1:-}"
if [ -z "$ARCHIVE" ]; then
    REMOTE=""
    if [ -n "${BACKUP_S3_ENDPOINT:-}" ] && [ -n "${BACKUP_S3_BUCKET:-}" ]; then
        export RCLONE_CONFIG=/dev/null
        export RCLONE_S3_PROVIDER=Other RCLONE_S3_ENDPOINT="$BACKUP_S3_ENDPOINT"
        export RCLONE_S3_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY:-}" RCLONE_S3_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_KEY:-}"
        [ -n "${BACKUP_S3_REGION:-}" ] && export RCLONE_S3_REGION="$BACKUP_S3_REGION"
        REMOTE=":s3:${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX:-vairiot}"
    elif [ -n "${BACKUP_REMOTE_TARGET:-}" ]; then
        REMOTE="$BACKUP_REMOTE_TARGET"
    fi
    if [ -n "$REMOTE" ]; then
        command -v rclone >/dev/null || fail "rclone is needed to fetch the off-host backup"
        LATEST="$(rclone lsf "${REMOTE}/daily/" --include 'vairiot-backup-*' | sort | tail -1)"
        [ -n "$LATEST" ] || fail "no backups found in ${REMOTE}/daily/"
        log "Fetching newest off-host backup: ${LATEST}"
        rclone copyto "${REMOTE}/daily/${LATEST}" "${WORK}/${LATEST}" || fail "download failed"
        ARCHIVE="${WORK}/${LATEST}"
    else
        ARCHIVE="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'vairiot-backup-*' 2>/dev/null | sort | tail -1)"
        [ -n "$ARCHIVE" ] || fail "no backups found in ${BACKUP_DIR}"
        log "Using newest local backup: $(basename "$ARCHIVE")"
    fi
fi
[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"

mkdir -p "${WORK}/x"
if [[ "$ARCHIVE" == *.age ]]; then
    : "${BACKUP_AGE_IDENTITY:?set BACKUP_AGE_IDENTITY to the age private-key file}"
    command -v age >/dev/null || fail "'age' is needed to decrypt"
    age -d -i "$BACKUP_AGE_IDENTITY" "$ARCHIVE" | tar -C "${WORK}/x" -xf - || fail "decryption/unpack failed"
else
    tar -C "${WORK}/x" -xf "$ARCHIVE" || fail "unpack failed"
fi
X="${WORK}/x"
DUMP="$(find "$X" -maxdepth 1 -name 'postgres-*.dump' | head -1)"
[ -n "$DUMP" ]               || fail "archive has no Postgres dump"
[ -f "${X}/minio.tgz" ]      || fail "archive has no MinIO data"
[ -f "${X}/env.snapshot" ]   || fail "archive has no .env snapshot"
[ -f "${X}/manifest.txt" ]   || log "WARNING: no manifest (archive predates format 2): counts can't be checked"
log "Archive unpacked: $(basename "$DUMP"), minio.tgz, env.snapshot$([ -f "${X}/redis.rdb" ] && echo ', redis.rdb')"

# ----- 2. Restore Postgres into the throwaway stack ------------------------
log "Starting throwaway stack (project vairiot-restoretest)…"
"${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
"${COMPOSE[@]}" up -d --wait postgres >/dev/null || fail "throwaway Postgres did not start"
PSQL=("${COMPOSE[@]}" exec -T postgres psql -U restoretest -d restoretest -At -v ON_ERROR_STOP=1)

log "Restoring Postgres…"
"${COMPOSE[@]}" exec -T postgres pg_restore -U restoretest -d restoretest --no-owner --no-acl --exit-on-error \
    < "$DUMP" || fail "pg_restore failed"

# ----- 3. Schema vs this checkout's migrations -----------------------------
log "Checking migration status…"
"${COMPOSE[@]}" --profile tools build -q prisma >/dev/null || fail "building the prisma tool image failed"
if STATUS="$("${COMPOSE[@]}" --profile tools run --rm -T prisma npx prisma migrate status 2>&1)"; then
    echo "  ✓ schema up to date with this checkout's migrations"
elif echo "$STATUS" | grep -qiE "failed|drift|modified after"; then
    echo "$STATUS" >&2
    fail "prisma migrate status reports failed or drifted migrations"
elif echo "$STATUS" | grep -qi "not yet been applied"; then
    # Normal when a deploy added migrations after this backup was taken:
    # restoring it and running migrate deploy would bring it up to date.
    echo "  ! backup predates migrations in this checkout (pending, not an error):"
    echo "$STATUS" | sed -n '/not yet been applied/,/^$/p' | sed 's/^/    /'
else
    echo "$STATUS" >&2
    fail "prisma migrate status could not check the restored database"
fi

# ----- 4. Row counts -------------------------------------------------------
ERRORS=0
if [ -f "${X}/manifest.txt" ]; then
    log "Comparing row counts with the backup manifest…"
    TABLES=0
    while IFS='|' read -r _ table before after; do
        TABLES=$((TABLES + 1))
        # </dev/null: `compose exec` would otherwise read the rest of the
        # manifest from this loop's stdin and end the loop after one table.
        got="$("${PSQL[@]}" -c "SELECT count(*) FROM \"${table}\"" </dev/null 2>/dev/null || echo MISSING)"
        lo=$(( before < after ? before : after )); hi=$(( before > after ? before : after ))
        if [ "$got" = "MISSING" ]; then
            echo "  ✗ ${table}: table missing after restore"; ERRORS=$((ERRORS + 1))
        elif [ "$got" -lt "$lo" ] || [ "$got" -gt "$hi" ]; then
            echo "  ✗ ${table}: restored ${got} rows, backup had ${before}–${after}"; ERRORS=$((ERRORS + 1))
        fi
    done < <(grep '^rows|' "${X}/manifest.txt")
    [ "$ERRORS" -eq 0 ] && log "  ✓ ${TABLES} tables match"
    [ "$TABLES" -gt 0 ] || { echo "  ✗ manifest lists no tables"; ERRORS=$((ERRORS + 1)); }

    # ----- 5. MinIO file counts ---------------------------------------------
    log "Comparing MinIO object counts…"
    mkdir -p "${WORK}/minio"
    tar -C "${WORK}/minio" -xzf "${X}/minio.tgz" || fail "minio.tgz is corrupt"
    while IFS='|' read -r _ bucket before after; do
        [ "$before" = "-1" ] && [ "$after" = "-1" ] && continue   # bucket didn't exist at backup time
        got="$(find "${WORK}/minio/${bucket}" -type f 2>/dev/null | wc -l | tr -d ' ')"
        lo=$(( before < after ? before : after )); hi=$(( before > after ? before : after ))
        if [ "$got" -lt "$lo" ] || [ "$got" -gt "$hi" ]; then
            echo "  ✗ ${bucket}: ${got} files in backup, bucket had ${before}–${after} objects"; ERRORS=$((ERRORS + 1))
        else
            echo "  ✓ ${bucket}: ${got} files"
        fi
    done < <(grep '^objects|' "${X}/manifest.txt")
fi

# ----- 6. Redis snapshot ---------------------------------------------------
if [ -f "${X}/redis.rdb" ]; then
    log "Loading Redis snapshot…"
    "${COMPOSE[@]}" create redis >/dev/null 2>&1
    "${COMPOSE[@]}" cp "${X}/redis.rdb" redis:/data/dump.rdb >/dev/null || fail "copying Redis snapshot failed"
    "${COMPOSE[@]}" up -d redis >/dev/null
    for _ in $(seq 1 30); do
        "${COMPOSE[@]}" exec -T redis redis-cli PING 2>/dev/null | grep -q PONG && break
        sleep 1
    done
    if "${COMPOSE[@]}" exec -T redis redis-cli PING 2>/dev/null | grep -q PONG; then
        echo "  ✓ snapshot loaded, $("${COMPOSE[@]}" exec -T redis redis-cli DBSIZE | tr -d '\r') keys"
    else
        echo "  ✗ Redis did not start with the snapshot"; ERRORS=$((ERRORS + 1))
    fi
fi

[ "$ERRORS" -eq 0 ] || fail "${ERRORS} check(s) failed for $(basename "$ARCHIVE")"
log "✅ Restore test passed: $(basename "$ARCHIVE")"
