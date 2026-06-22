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

The script handles `git pull`, container rebuild/restart, and the nginx restart that re-resolves upstream container IPs.

## What the script does

1. `git pull --ff-only` in `/opt/Vairiot`.
2. `docker compose --env-file /opt/Vairiot/.env -f infra/docker-compose.prod.yml up -d --build`
   — the `--env-file` flag is required because compose by default only reads `.env` from the compose file's directory (`infra/`), but the real env lives at the repo root.
3. `docker restart vairiot_nginx` — without this, nginx keeps the old internal IP of any recreated container (api, web, etc.) and returns 502 Bad Gateway.
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
- **502 Bad Gateway after deploy** — nginx is holding a stale IP for the api container. `docker restart vairiot_nginx`.
- **`Permission denied (publickey)`** when SSHing — make sure `~/.ssh/vairiot_key` exists locally and `~/.ssh/config` has the `Host vairiot` block pointing at it.

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
