# Production deploy

Production runs on `81.85.92.155` (Ubuntu 24.04). Repo lives at `/opt/Vairiot`. SSH alias is `vairiot`.

## One-line deploy

```
ssh vairiot 'bash /opt/Vairiot/infra/deploy.sh'
```

Or, if already on the server:

```
bash /opt/Vairiot/infra/deploy.sh
```

The script stops at the first failure and exits non-zero, printing the failing container's recent logs.

## What the script does

1. `git pull --ff-only` in `/opt/Vairiot`.
2. Builds every image (`docker compose --env-file /opt/Vairiot/.env -f infra/docker-compose.prod.yml build`).
   — the `--env-file` flag is required because compose by default only reads `.env` from the compose file's directory (`infra/`), but the real env lives at the repo root.
3. Applies migrations on their own (`… run --rm migrate`, i.e. `prisma migrate deploy`). **If a migration fails, the deploy stops here and nothing has been restarted: the previous version keeps serving.** Fix the migration and deploy again.
4. `… up -d --remove-orphans` starts the new containers.
5. Waits up to `DEPLOY_WAIT_SECONDS` (default 300) for every long-running container to report healthy; fails with their logs if one doesn't.
6. `docker exec vairiot_nginx nginx -s reload` — picks up any `prod.conf` changes. Upstream container IPs no longer require a restart: nginx re-resolves them at request time via the `resolver` directive.
7. Calls `/health/ready` inside the api container (database + Redis must answer).
8. Installs the certbot renewal hook (`infra/certbot/reload-nginx.sh` → `/etc/letsencrypt/renewal-hooks/deploy/vairiot-reload-nginx.sh`) if it is missing or out of date, so a renewed certificate is served straight away. If the deploy user can't write there, it prints the one `sudo install` command to run.
9. Prints `docker ps`.

## Manual deploy (if the script fails)

```
cd /opt/Vairiot
git pull
docker compose --env-file /opt/Vairiot/.env -f infra/docker-compose.prod.yml build
docker compose --env-file /opt/Vairiot/.env -f infra/docker-compose.prod.yml run --rm migrate   # stop here if this fails
docker compose --env-file /opt/Vairiot/.env -f infra/docker-compose.prod.yml up -d
docker restart vairiot_nginx
docker ps                                                                                    # wait for (healthy)
```

## Common gotchas

- **`WARN: variable is not set` everywhere** — you forgot `--env-file /opt/Vairiot/.env`. Postgres/Redis will recreate with blank passwords and refuse connections against the existing data volume.
- **502 Bad Gateway after deploy** — should no longer happen (nginx re-resolves upstreams via `resolver`). If it does, `docker exec vairiot_nginx nginx -s reload`, or restart nginx.
- **MinIO is built from source** (`infra/minio/Dockerfile`), because MinIO stopped publishing images in 2025 (`minio/minio` no longer pulls). The first deploy after this change builds it, which takes a few minutes and needs about 2 GB of free memory. Later deploys reuse the cached build. The same image is published to GHCR by CI (`vairiot-minio`). To upgrade, follow the comment at the top of the Dockerfile; Dependabot can't track it, so check MinIO's releases monthly for "Security/CVE" releases.
- **`Permission denied (publickey)`** when SSHing — make sure `~/.ssh/vairiot_key` exists locally and `~/.ssh/config` has the `Host vairiot` block pointing at it.

## Operations

### Backups (off-host)

`infra/backup.sh` makes one archive of the Postgres dump, the MinIO buckets, a Redis snapshot and the `.env` (which holds `APP_ENCRYPTION_KEY` — without it, a dump's encrypted SMTP credentials are unrecoverable), encrypts it with [age](https://age-encryption.org), and copies it to S3-compatible storage off the host. It keeps **30 daily and 12 monthly** copies off-host (the first backup of each month is also kept under `monthly/`) and a week locally. Each archive carries a manifest of row and object counts, which the restore test checks.

Set up once on the server:

```
# 1. Tools
apt-get install -y age rclone

# 2. An encryption key pair. Keep the PRIVATE key (identity) somewhere safe
#    OFF this server too (password manager): without it no backup can be read.
age-keygen -o /root/vairiot-backup-identity.txt     # prints "Public key: age1…"

# 3. A bucket in an EU region (GDPR), e.g. Backblaze B2 eu-central or Scaleway.
#    Create an application key limited to that bucket.

# 4. Settings in /opt/Vairiot/.env
BACKUP_AGE_RECIPIENT=age1…                         # the public key from step 2
BACKUP_S3_ENDPOINT=https://s3.eu-central-003.backblazeb2.com
BACKUP_S3_BUCKET=vairiot-backups
BACKUP_S3_ACCESS_KEY=…
BACKUP_S3_SECRET_KEY=…
BACKUP_AGE_IDENTITY=/root/vairiot-backup-identity.txt   # only for restore-test on this host

# 5. Cron (daily backup at 02:30 UTC)
crontab -l 2>/dev/null | cat - /opt/Vairiot/infra/backup.crontab | crontab -

# 6. Prove it works
bash /opt/Vairiot/infra/backup.sh && bash /opt/Vairiot/infra/restore-test.sh
```

`BACKUP_REMOTE_TARGET` (an `rclone` `remote:path` set up with `rclone config`) still works instead of `BACKUP_S3_*`.

**Exit codes and alerting.** `0` = complete. `1` = failed (`[BACKUP-FAILED]` in `/var/log/vairiot-backup.log`). `2` = an archive was made but is **incomplete** (`[BACKUP-INCOMPLETE]`). For example, with no `BACKUP_AGE_RECIPIENT` the archive stays local (mode 600) and is never sent off-host unencrypted, because it contains `.env`. Alert on either marker.

**Restore** into production: `CONFIRM=yes bash infra/restore.sh <archive>` (destructive; add `RESTORE_REDIS=yes` to also restore queues/blacklist, usually unnecessary). The `.env` from the backup is written to `.env.restored` for you to reconcile by hand.

### Monthly restore test

A backup nobody has restored is a hope, not a backup. Once a month run:

```
bash /opt/Vairiot/infra/restore-test.sh
```

It downloads the **newest off-host** backup (the copy that matters when the server is gone), decrypts it, restores it into a throwaway compose project (`vairiot-restoretest`, never touches production), and checks:
- `prisma migrate status` against this checkout (a backup older than the latest deploy's migrations is reported, not failed);
- every table's row count against the backup's manifest;
- every bucket's file count;
- that the Redis snapshot loads.

It then tears the stack down. Exit 0 and `✅ Restore test passed` mean the backup is restorable; anything else prints `[RESTORE-TEST-FAILED]` with the reason. It needs `BACKUP_AGE_IDENTITY`. If you would rather not keep the private key on the server, run it from another machine with Docker, a checkout of this repo and the same `.env` settings. `infra/backup.crontab` has a commented monthly cron line for running it on the server.

### Monitoring

- **Healthchecks** — every long-running container has a Docker healthcheck; `docker ps` shows `(healthy)`. The api checks `/health`, the worker a liveness heartbeat file, nginx `/nginx-health`, web and admin their index page; postgres, redis, minio and reports their own probes. `deploy.sh` waits for all of them.
- **Error tracking** (optional) — Sentry, or self-hosted [GlitchTip](https://glitchtip.com) which speaks the same protocol (useful for in-country deployments):
  - `SENTRY_DSN` in `.env` → api (5xx and unhandled errors) and worker (jobs that exhaust their retries).
  - `VITE_SENTRY_DSN` in `.env` → the web app (browser errors, no tracing). Read at build time: redeploy after changing it. The SDK is only downloaded when this is set.
  - Unset = disabled.
- **Failed-job email** — set `OPS_ALERT_EMAIL` and the worker emails that address when a background job (invites, digests, webhooks, reports) fails for good. Throttled to one email per queue per 15 minutes, with a count of the failures held back; no job data is included. Uses the same mail settings as the rest of the app.
- **Log rotation** — container logs are capped at 5 × 20 MB per container (`x-logging` in the compose file).
- **Uptime** — configure an external monitor to poll `https://vai.vairiot.com/health/ready` every 1–5 min and alert by phone/email. It returns `200 {"status":"ready"}` only when the API can reach Postgres and Redis, and `503` otherwise. This is the only check that catches a fully-down host, which internal healthchecks cannot. For example, UptimeRobot (free): *Add New Monitor* → type **HTTP(s) – Keyword** → URL `https://vai.vairiot.com/health/ready` → keyword `"ready"` (*alert when not exists*) → interval 5 min → alert contacts: phone app + email. Better Stack works the same way.

### Operational env vars (added)

| Var | Purpose | Default if unset |
|-----|---------|------------------|
| `SENTRY_DSN` | Error tracking (api + worker) | disabled |
| `VITE_SENTRY_DSN` | Error tracking (web app; build-time) | disabled |
| `OPS_ALERT_EMAIL` | Email for background jobs that fail for good | no email |
| `DEPLOY_WAIT_SECONDS` | How long `deploy.sh` waits for healthy containers | 300 |
| `BACKUP_AGE_RECIPIENT` | age public key the backups are encrypted to | backups stay local, exit 2 |
| `BACKUP_S3_ENDPOINT` / `BACKUP_S3_BUCKET` / `BACKUP_S3_ACCESS_KEY` / `BACKUP_S3_SECRET_KEY` (`BACKUP_S3_REGION`, `BACKUP_S3_PREFIX`) | Off-host backup storage | backups stay local, exit 2 |
| `BACKUP_AGE_IDENTITY` | age private key file, for `restore.sh` / `restore-test.sh` | — |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` / `JWT_SETUP_SECRET` | Per-token-class JWT secrets | falls back to `JWT_SECRET` |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | Scoped MinIO service account | falls back to root user |
| `BACKUP_REMOTE_TARGET` | rclone `remote:path`, alternative to `BACKUP_S3_*` | — |
| `RATE_LIMIT_SYNC_PER_MIN` | Per-user limit on the offline-sync routes (POST assets, audit scans, scan sessions, photo uploads). These routes are exempt from the 100/min per-IP limit so scanners behind one NAT don't throttle each other | 600 |
| `IOS_UDID_CA_FILE` | Path *inside the api container* to the Apple CA bundle used to verify iOS enrolment payloads. When set, unverified enrolments are refused | unset: accepted, stored as `signatureVerified = false` |

### iOS enrolment signature checks (`IOS_UDID_CA_FILE`)

The public enrolment endpoint (`/api/v1/ios/udid/callback`) receives a plist
signed by the iPhone's Apple-issued device certificate. Until verification is
switched on, an attacker could queue made-up devices. They can't install
anything, but an admin could be fooled into registering one. Each device in
the admin list shows `signatureVerified`; register only devices that are
verified, or that you know.

To switch verification on:

1. Download Apple's root and iPhone device CA certificates from
   <https://www.apple.com/certificateauthority/> (Apple Root CA, Apple iPhone
   Certification Authority, Apple iPhone Device CA). Concatenate them as PEM
   into `/opt/Vairiot/infra/apple-device-ca.pem`.
2. Mount it into the api container (`volumes: - ./apple-device-ca.pem:/etc/vairiot/apple-device-ca.pem:ro`)
   and set `IOS_UDID_CA_FILE=/etc/vairiot/apple-device-ca.pem` in `.env`.
3. **Before relying on it**, enrol a real iPhone and check that the device row
   shows `signatureVerified: true`. If enrolment fails (Settings shows an
   error), unset the variable to fall back, and check the API log for
   `iOS enrolment refused`. The certificate chain is the likely cause.

### Delta sync and the asset cache

The apps keep an offline copy of the asset register. They fetch changes with
`GET /api/v1/assets?changedSince=` and run a full sync once a day. After a
bulk change that does not touch asset rows (for example renaming a category or
site), cached names refresh on the next daily full sync.

## Services

| Service          | Container          | Internal port | Notes                                    |
|------------------|--------------------|---------------|------------------------------------------|
| nginx            | `vairiot_nginx`    | 80 / 443      | Only container exposed to host           |
| web (Vite build) | `vairiot_web`      | 80            | Served via nginx                         |
| api              | `vairiot_api`      | 3001          | Node/Express                             |
| reports          | `vairiot_reports`  | 8100          | Python/FastAPI — PDF/XLSX/DOCX/CSV       |
| worker           | `vairiot_worker`   | —             | BullMQ background jobs                   |
| postgres         | `vairiot_postgres` | 5432          | Data at `/opt/Vairiot/infra/data/postgres` |
| redis            | `vairiot_redis`    | 6379          | Data at `/opt/Vairiot/infra/data/redis`    |
| minio            | `vairiot_minio`    | 9000          | Data at `/opt/Vairiot/infra/data/minio`    |
