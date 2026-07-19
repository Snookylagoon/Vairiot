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

The script handles `git pull`, Prisma migrations (via the one-shot `migrate` service), container rebuild/restart, and an nginx reload for config changes.

## What the script does

1. `git pull --ff-only` in `/opt/Vairiot`.
2. `docker compose --env-file /opt/Vairiot/.env -f infra/docker-compose.prod.yml up -d --build`
   — the `--env-file` flag is required because compose by default only reads `.env` from the compose file's directory (`infra/`), but the real env lives at the repo root.
   — the `migrate` service runs `prisma migrate deploy` and must exit 0 before the api starts, so schema changes are applied automatically.
3. `docker exec vairiot_nginx nginx -s reload` — picks up any `prod.conf` changes. Upstream container IPs no longer require a restart: nginx re-resolves them at request time via the `resolver` directive.
4. Prints `docker ps`.

## Manual deploy (if the script fails)

```
cd /opt/Vairiot
git pull
docker compose --env-file /opt/Vairiot/.env -f infra/docker-compose.prod.yml up -d --build
docker restart vairiot_nginx
docker ps
```

## Common gotchas

- **`WARN: variable is not set` everywhere** — you forgot `--env-file /opt/Vairiot/.env`. Postgres/Redis will recreate with blank passwords and refuse connections against the existing data volume.
- **502 Bad Gateway after deploy** — should no longer happen (nginx re-resolves upstreams via `resolver`). If it does, `docker exec vairiot_nginx nginx -s reload`, or restart nginx.
- **`Permission denied (publickey)`** when SSHing — make sure `~/.ssh/vairiot_key` exists locally and `~/.ssh/config` has the `Host vairiot` block pointing at it.

## Operations

### Backups (off-host)

`infra/backup.sh` produces a single timestamped archive of the Postgres dump, the MinIO buckets, and the `.env` (which holds `APP_ENCRYPTION_KEY` — without it, a DB dump's encrypted SMTP creds are unrecoverable), then pushes it off-host via `rclone` and prunes old copies. Restore with `infra/restore.sh <archive>` (`CONFIRM=yes`, destructive).

Set up once on the server:

```
# 1. install tools:  apt-get install -y rclone age   (age optional, for at-rest encryption)
# 2. configure an rclone remote in an EU region (GDPR):  rclone config   → e.g. remote name "s3eu"
# 3. install the cron line (edit the age recipient first):
crontab -l 2>/dev/null | cat - /opt/Vairiot/infra/backup.crontab | crontab -
# 4. test it end to end, then test a RESTORE into a throwaway DB before trusting it.
```

Required env for real protection (in `/opt/Vairiot/.env` or the cron line):
`BACKUP_REMOTE_TARGET` (rclone `remote:path`) and `BACKUP_AGE_RECIPIENT` (age public key). Without the remote target the backup is local-only and dies with the host.

### Monitoring

- **Healthchecks** — every container has a Docker healthcheck; `docker ps` shows `(healthy)`. The api checks `/health`, the worker checks a liveness heartbeat file, nginx checks `/nginx-health`.
- **Sentry** (optional) — set `SENTRY_DSN` in `.env` to enable error tracking on the api (5xx + unhandled errors) and worker (jobs that exhaust their retries). Unset = disabled, no-op.
- **Uptime** — configure an external monitor (UptimeRobot / Better Stack, free tier) to poll `https://vai.vairiot.com/health/ready` every 1–5 min with an alert to phone/email. This is the only check that catches a fully-down host, which internal healthchecks cannot.

### Operational env vars (added)

| Var | Purpose | Default if unset |
|-----|---------|------------------|
| `SENTRY_DSN` | Error tracking (api + worker) | disabled |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` / `JWT_SETUP_SECRET` | Per-token-class JWT secrets | falls back to `JWT_SECRET` |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | Scoped MinIO service account | falls back to root user |
| `BACKUP_REMOTE_TARGET` / `BACKUP_AGE_RECIPIENT` | Off-host backup destination + encryption | local-only / unencrypted |

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
