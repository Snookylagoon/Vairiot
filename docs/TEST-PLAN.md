# Vairiot test plan — verify each fix

How to check that each audit fix actually works, written so you can follow it with
no prior experience. Do these **on the staging server** (`test.vairiot.com`) set up
in `docs/STAGING-SETUP.md` — never on production.

**How to read a test:**
- **What** — what the fix is supposed to do.
- **Steps** — exactly what to type or click.
- **Pass** — what you should see if it's working. If you see this, tick it off.
- **Fail** — what it looks like broken, and what to send me.

**Two places you'll work:**
- **Server Terminal** — a Terminal on your Mac connected with `ssh root@SERVER_IP`.
  The prompt shows `root@vairiot-staging`.
- **Browser** — Chrome/Safari/Firefox on your Mac, at `https://test.vairiot.com`.

Before starting any batch, load the latest code (server Terminal):
```
cd /opt/Vairiot && git fetch && git checkout audit-remediation && git pull && bash infra/deploy.sh
```
Wait for the container table at the end.

---

# Batch 1 tests

## 1.1 — Everything still runs (smoke test)

**What:** the new compose settings (memory limits, healthchecks, pinned MinIO,
migrate step) start cleanly.

**Steps** (server Terminal):
```
docker ps
```

**Pass:** you see 9 containers (`nginx, api, web, admin, worker, postgres, redis,
minio, reports`). Most show `(healthy)` in the STATUS column. There is **no**
container stuck `Restarting`.

**Fail:** a container shows `Restarting` or `unhealthy`. Run
`docker logs <name> --tail 50` (e.g. `docker logs vairiot_api --tail 50`) and send
me the output.

---

## 1.2 — Migrations run automatically on deploy

**What:** deploying now applies database migrations by itself (before, this was a
manual step everyone could forget).

**Steps** (server Terminal):
```
docker logs vairiot_migrate
```

**Pass:** you see Prisma output ending in something like *"No pending migrations
to apply"* or a list of applied migrations — and the container exited (it's a
one-shot). The `api` only started after this succeeded.

**Fail:** the log shows an error and `docker ps` shows the `api` never came up.
Send me the `vairiot_migrate` log.

---

## 1.3 — The site is secure (HTTPS, HSTS, gzip)

**What:** the admin site now sends the security headers it was missing, and
responses are compressed.

**Steps** (Mac Terminal — a normal one, not the server):
```
curl -sI https://testadmin.vairiot.com | grep -i "strict-transport"
curl -sI -H "Accept-Encoding: gzip" https://test.vairiot.com/ | grep -i "content-encoding"
```

**Pass:** the first line prints `strict-transport-security: max-age=31536000...`.
The second prints `content-encoding: gzip`.

**Fail:** either prints nothing. Tell me which one.

---

## 1.4 — nginx no longer needs a manual restart after deploy

**What:** the old bug where the site returned "502 Bad Gateway" after every deploy
until nginx was manually restarted is gone (nginx now re-finds the app
automatically).

**Steps** (server Terminal) — force the api to get a new internal address, then
check the site immediately **without** touching nginx:
```
docker compose --env-file .env -f infra/docker-compose.prod.yml up -d --force-recreate --no-deps api
sleep 5
curl -k -s -o /dev/null -w "%{http_code}\n" https://test.vairiot.com/health
```

**Pass:** it prints `200`. (Before this fix it would have printed `502`.)

**Fail:** it prints `502` or `000`. Send me the number.

---

## 1.5 — nodemailer upgrade (email still works)

**What:** the email library was upgraded to close security holes; sending must
still work.

**Steps:**
1. In the **admin panel** (`https://testadmin.vairiot.com`), log in, find
   **Settings → Email/SMTP**, and either configure a real SMTP server or use the
   built-in "send test email" button if present.
2. Or, simplest on staging, just confirm the worker started its mailer cleanly
   (server Terminal):
   ```
   docker logs vairiot_worker | grep -i "mail\|smtp\|transport"
   ```

**Pass:** you see a line like *"Mail transport source: ..."* or *"No email
configured — emails will be logged"* — and **no** crash/stack-trace mentioning
nodemailer.

**Fail:** the worker log shows an error mentioning `nodemailer`. Send it to me.

---

## 1.6 — Error tracking (Sentry) — optional

**What:** if you set a Sentry key, server errors get reported. If you don't, it's
silently off (that's fine for now).

**Steps:** only if you have a Sentry account — add `SENTRY_DSN=...your-dsn...` to
`/opt/Vairiot/.env`, then `bash infra/deploy.sh`, then:
```
docker logs vairiot_api | grep -i sentry
```

**Pass:** you see *"Sentry monitoring enabled"*. (No Sentry key = this line is
absent, which is expected and OK.)

---

## 1.7 — Off-host backups work AND can be restored

**What:** the most important fix — you can now take a full backup and bring it
back. **A backup you've never restored is not a backup.**

**Steps (take a backup)** — server Terminal:
```
cd /opt/Vairiot
BACKUP_DIR=/opt/Vairiot/backups bash infra/backup.sh
ls -lh /opt/Vairiot/backups
```

**Pass:** the script ends with `Backup OK: vairiot-backup-....tar` and `ls` shows
a file of a few MB or more. (It will warn that `BACKUP_REMOTE_TARGET` is unset —
that's expected until you set up off-host storage; the local archive still proves
the machinery works.)

**Steps (prove a restore works)** — this is the real test. We'll create a marker,
back up, delete the marker, restore, and confirm it came back. Do this on
**staging only**:
1. Create a throwaway test organisation in the app (`test.vairiot.com` → Register),
   note its name.
2. Take a backup (command above).
3. In the app, delete that organisation (or just note it exists — we'll confirm it
   survives a restore).
4. Restore (server Terminal — this overwrites the staging DB, which is fine):
   ```
   CONFIRM=yes bash infra/restore.sh /opt/Vairiot/backups/vairiot-backup-*.tar
   ```
5. Reload the app in your browser and log in.

**Pass:** the restore command finishes with *"Postgres + MinIO restored"*, and the
organisation/data from the backup is present after logging in again.

**Fail:** the restore errors out. Copy the output and send it to me.

**Set up real off-host backups (do once you're happy):** follow the "Backups"
section in `docs/DEPLOY.md` to install `rclone`, point it at EU storage, and add
`BACKUP_REMOTE_TARGET` so backups leave the server.

---

## 1.8 — Android blind-audit offline scans are no longer lost

**What:** the headline mobile fix. Scans taken **offline** during a *blind* audit
used to be silently deleted. Now they sync correctly.

You need the Android app pointed at staging. If your test phone's app points at
production, tell me and I'll give you a staging build; otherwise test against
whatever server the app uses and just confirm the behaviour.

**Steps:**
1. In the admin/app, create an audit **campaign** in **blind** mode with at least
   one location/zone.
2. On the Android device, open that campaign, select a zone.
3. Put the phone in **Airplane mode** (this simulates being offline / in a dead
   zone).
4. Scan a few asset tags (or type them in). You'll see "Queued offline".
5. Turn Airplane mode **off** and wait ~30 seconds (or reopen the app) so it syncs.
6. In the admin panel, open the campaign's results.

**Pass:** the scans you took offline appear in the campaign results, **with their
zone/location**, and the pending count returns to 0. Condition notes you added are
also present.

**Fail:** the offline scans are missing after syncing, or the pending count never
clears. Tell me how many you scanned vs how many appeared.

---

*(Batch 2 test procedures are added below as each part lands.)*
