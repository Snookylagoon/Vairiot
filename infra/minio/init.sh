#!/bin/sh
# ---------------------------------------------------------------------------
# One-shot MinIO setup, run by the `minio-init` service on every deploy
# (docker-compose.prod.yml). Idempotent.
#
#   1. creates the three app buckets;
#   2. creates the `vairiot-app` policy: the S3 calls the API makes, on those
#      buckets only — no other bucket, no admin API;
#   3. creates (or updates the secret of) the app user MINIO_ACCESS_KEY /
#      MINIO_SECRET_KEY and attaches the policy.
#
# The API then connects as that user instead of root (audit SEC-M3): a
# compromised API can read and write app files, but can't touch other buckets,
# change policies or create users.
#
# If MINIO_ACCESS_KEY is unset, only step 1 runs and the API keeps using the
# root credentials (it logs a warning at startup; so does deploy.sh).
# ---------------------------------------------------------------------------
set -eu

: "${MINIO_ROOT_USER:?}"
: "${MINIO_ROOT_PASSWORD:?}"
PHOTOS="${MINIO_PHOTOS_BUCKET:-vairiot-photos}"
DOCUMENTS="${MINIO_DOCUMENTS_BUCKET:-vairiot-documents}"
RELEASES="${MINIO_MOBILE_RELEASES_BUCKET:-vairiot-mobile-releases}"
ENDPOINT="${MINIO_INIT_ENDPOINT:-http://minio:9000}"
POLICY=vairiot-app

mc alias set vairiot "$ENDPOINT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null

for b in "$PHOTOS" "$DOCUMENTS" "$RELEASES"; do
    mc mb --ignore-existing "vairiot/$b" >/dev/null
done
echo "minio-init: buckets ready ($PHOTOS, $DOCUMENTS, $RELEASES)"

if [ -z "${MINIO_ACCESS_KEY:-}" ]; then
    echo "minio-init: WARNING MINIO_ACCESS_KEY is not set — the API uses the MinIO ROOT credentials (audit SEC-M3). Set MINIO_ACCESS_KEY/MINIO_SECRET_KEY in .env and redeploy."
    exit 0
fi
: "${MINIO_SECRET_KEY:?MINIO_ACCESS_KEY is set but MINIO_SECRET_KEY is not}"
if [ "$MINIO_ACCESS_KEY" = "$MINIO_ROOT_USER" ]; then
    echo "minio-init: MINIO_ACCESS_KEY must differ from MINIO_ROOT_USER" >&2
    exit 1
fi
if [ "${#MINIO_SECRET_KEY}" -lt 16 ]; then
    echo "minio-init: MINIO_SECRET_KEY must be at least 16 characters" >&2
    exit 1
fi

# Exactly what vairiot-api/src does with object storage: bucketExists /
# makeBucket (startup), putObject, getObject, listObjectsV2, removeObject(s).
POLICY_FILE="$(mktemp)"
cat > "$POLICY_FILE" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AppBuckets",
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:GetBucketLocation", "s3:CreateBucket", "s3:ListBucketMultipartUploads"],
      "Resource": ["arn:aws:s3:::$PHOTOS", "arn:aws:s3:::$DOCUMENTS", "arn:aws:s3:::$RELEASES"]
    },
    {
      "Sid": "AppObjects",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts"],
      "Resource": ["arn:aws:s3:::$PHOTOS/*", "arn:aws:s3:::$DOCUMENTS/*", "arn:aws:s3:::$RELEASES/*"]
    }
  ]
}
EOF
mc admin policy create vairiot "$POLICY" "$POLICY_FILE" >/dev/null
rm -f "$POLICY_FILE"

# `user add` creates the user or resets its secret, so rotating
# MINIO_SECRET_KEY in .env takes effect on the next deploy.
mc admin user add vairiot "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" >/dev/null
if ! mc admin user info vairiot "$MINIO_ACCESS_KEY" 2>/dev/null | grep -q "PolicyName: .*$POLICY"; then
    mc admin policy attach vairiot "$POLICY" --user "$MINIO_ACCESS_KEY" >/dev/null
fi
echo "minio-init: app user '$MINIO_ACCESS_KEY' limited to policy $POLICY"
