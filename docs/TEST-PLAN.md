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

# Batch 2 tests — security mediums (M1–M6)

## 2.1 — New password rules

**What:** passwords used to have to be *exactly* 12 letters/numbers (bizarre and
weak). Now: at least 12 characters, anything allowed, and either a mix of
character types or a long passphrase.

**Steps** (Browser — `https://test.vairiot.com`, logged in as an admin):
1. Go to user management and start creating a new user.
2. Try password `alllowercase` (12 lower-case letters) → should be **rejected**
   with a message about mixing character types.
3. Try `administrator` → **rejected** ("too common").
4. Try `StrongPass1!` → **accepted** (symbols are now allowed).
5. Try the passphrase `correct horse battery staple` → **accepted**.

**Pass:** rejections and acceptances exactly as above.

**Fail:** a weak one is accepted or a strong one rejected. Tell me which password
and what message you saw.

---

## 2.2 — 2FA secrets are no longer stored readable

**What:** two-factor secrets and backup codes used to sit readable in the
database; now they're encrypted/hashed.

**Steps:**
1. In the Browser, log in as any user, go to security settings, and **enable
   two-factor** (scan the QR with an authenticator app, save the backup codes,
   confirm with a code).
2. Server Terminal:
   ```
   docker exec vairiot_postgres psql -U vairiot -d vairiot -c "SELECT secret, \"backupCodes\"[1] FROM user_two_factor LIMIT 3;"
   ```

**Pass:** every `secret` starts with `v1:` followed by gibberish, and the backup
code starts with `$2` (a hash) — you can't read either.

**Fail:** you can read a plain secret (letters/numbers that match what the QR
setup showed) or a plain 8-character backup code. Send me a screenshot with the
values blurred.

Also confirm logging in with 2FA still works, and that **one backup code** works
once (and is rejected if used a second time).

---

## 2.3 — A stolen "keep me logged in" token can't be reused

**What:** refresh tokens are now single-use. Using the same one twice means theft
— the second use is rejected.

**Steps** (Mac Terminal; replace the email/password with a staging login):
```
TOKEN=$(curl -s https://test.vairiot.com/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"YourPassword1!","tenantId":"YOUR_TENANT"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["refreshToken"])')
curl -s -o /dev/null -w "first use: %{http_code}\n"  https://test.vairiot.com/api/v1/auth/refresh -H 'Content-Type: application/json' -d "{\"refreshToken\":\"$TOKEN\"}"
curl -s -o /dev/null -w "second use: %{http_code}\n" https://test.vairiot.com/api/v1/auth/refresh -H 'Content-Type: application/json' -d "{\"refreshToken\":\"$TOKEN\"}"
```

**Pass:** `first use: 200`, `second use: 401`.

**Fail:** second use also prints `200`. Tell me both numbers.

---

## 2.4 — Secret-strength warnings

**What:** the server now complains at startup if its cryptographic secrets are
weak, short, or shared.

**Steps** (server Terminal):
```
docker logs vairiot_api 2>&1 | grep "\[security\]"
```

**Pass:** ideally **nothing** prints (secrets are strong and distinct). If lines
print, they tell you exactly what to fix in `/opt/Vairiot/.env` — e.g. generate
values with `openssl rand -hex 32` and set `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET`, `JWT_SETUP_SECRET` to three *different* values, then
redeploy and re-run this check until nothing prints.

---

## 2.5 — API uses a limited storage account (not the master key)

**What:** the API can now run with a MinIO account limited to the app's buckets
instead of the all-powerful root credentials.

**Steps** (server Terminal — one-time setup):
```
docker exec vairiot_minio mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
docker exec vairiot_minio mc admin user svcacct add local "$MINIO_ROOT_USER" --access-key vairiot-app --secret-key "$(openssl rand -hex 24)"
```
Then add to `/opt/Vairiot/.env`: `MINIO_ACCESS_KEY=vairiot-app` and
`MINIO_SECRET_KEY=<the secret you generated>`, and redeploy.

**Pass:** after redeploy, uploading and viewing an asset photo in the app still
works.

**Fail:** photo upload errors after the change. Send me
`docker logs vairiot_api --tail 50`.

*(If you skip this setup, nothing breaks — the API just keeps using root
credentials like before. The fix makes the scoped account possible.)*

---

# Batch 3 tests — notification scheduler

## 3.1 — Scheduler is registered

**What:** alert digest emails users could subscribe to were never actually sent —
nothing ever triggered them. Now the worker schedules them (daily 07:00, weekly
Monday 07:00, server time).

**Steps** (server Terminal):
```
docker logs vairiot_worker 2>&1 | grep "notification-scheduler"
```

**Pass:** a line like *"notification-scheduler registered: daily "0 7 * * *",
weekly "0 7 * * 1""*.

**Fail:** no such line, or an error mentioning notification-scheduler. Send it
to me.

---

## 3.2 — A digest email actually arrives

**What:** end-to-end proof: subscribe → something is wrong with an asset →
email arrives (with maintenance-due items listed).

**Steps:**
1. Browser: log in, go to **Alerts / notification settings**, subscribe to
   **Overdue maintenance** with frequency **daily**. (Make sure your user's email
   is real, and SMTP is configured on staging — test 1.5.)
2. Create the problem: on any asset, schedule a **maintenance** event with a date
   in the past (yesterday). It's now "overdue".
3. Don't wait for 07:00 — speed the schedule up. In `/opt/Vairiot/.env` add:
   ```
   ALERT_DIGEST_DAILY_CRON=*/2 * * * *
   ```
   then redeploy (`bash infra/deploy.sh`) and wait ~3 minutes.
4. Server Terminal:
   ```
   docker logs vairiot_worker --tail 30
   ```
5. Check the subscriber's email inbox.

**Pass:** the worker log shows *"notification-scheduler(daily): 1 digest(s)
enqueued"* then *"alert-digest job ... sent"*, and the email arrives listing
**Overdue maintenance: 1** and the asset under "Maintenance due in the next
7 days" marked **(OVERDUE)**.

Also check: wait another 2 minutes — **no second email** arrives (each digest is
sent at most once per day even if the schedule fires again).

**Cleanup:** remove the `ALERT_DIGEST_DAILY_CRON` line from `.env` and redeploy,
so staging goes back to the normal 07:00 schedule.

**Fail:** no "enqueued" line, an error in the worker log, or no email. Send me
the last 30 lines of the worker log.

---

# Batch 4 tests — offline sync integrity (mobile)

These need a phone with the updated app build. Everything is about one promise:
**work done offline is never silently lost.**

## 4.1 — Offline scans survive a phone reboot

**What:** before, restarting the app forced a re-login and queued offline scans
got stuck (the sync kept failing while logged out) and were eventually deleted.
Now the session survives restarts and queued work drains.

**Steps (Android or iPhone):**
1. Log in. Put the phone in **Airplane mode**.
2. In an in-progress audit, scan (or type) 3 asset tags. They queue offline.
3. **Restart the phone** (full power off/on) with Airplane mode still on.
4. Open the app — you should still be **logged in** (no login screen).
5. Turn Airplane mode **off**, open the app, wait ~30 seconds.
6. Check the campaign results in the admin panel.

**Pass:** all 3 scans arrive; app never asked you to log in again.

**Fail:** the app asked for login after restart, or scans are missing. Tell me
which step and which phone (Android/iPhone).

---

## 4.2 — Replayed scans can't be double-counted

**What:** if the app crashes at exactly the wrong moment, it used to be able to
send the same scan twice. Scans now carry a unique ID and the server ignores
repeats.

**Steps** (server Terminal — after doing 4.1):
```
docker exec vairiot_postgres psql -U vairiot -d vairiot -c "SELECT COUNT(*), COUNT(DISTINCT \"clientRequestId\") FROM audit_scan_events WHERE \"clientRequestId\" IS NOT NULL;"
```

**Pass:** the two numbers are **equal** (every scan has a unique ID, no repeats),
and new scan rows also show a `capturedAt` when you check them — the time you
actually scanned, not the time the phone got signal back:
```
docker exec vairiot_postgres psql -U vairiot -d vairiot -c "SELECT \"tagValue\", \"scannedAt\", \"capturedAt\" FROM audit_scan_events ORDER BY \"scannedAt\" DESC LIMIT 5;"
```
For scans taken in Airplane mode, `capturedAt` should be **earlier** than
`scannedAt`.

---

## 4.3 — Failed items are parked, not deleted

**What:** items that genuinely can't sync (e.g. the server rejects them) used to
be silently deleted after 5 tries. Now they're kept and shown to you.

**Steps** (either phone):
1. Put the phone in Airplane mode and create an asset offline — but give it
   something the server will reject. Easiest: ask me to briefly enable a
   rejection on staging, **or** simulate it: scan into a **blind audit zone**,
   have someone else **submit that zone** from the admin panel, then reconnect.
   The server now refuses those scans ("zone locked").
2. Reconnect and let it sync. Wait a couple of minutes (it retries 5 times).
3. Open **Profile** in the app.

**Pass:** a **"Failed sync items"** card appears showing the count, with
**Retry all** and **Discard** buttons. Discard asks for confirmation before
deleting. The items were NOT silently thrown away.

**Fail:** the queued item just vanishes and Profile shows nothing. Tell me what
you queued and what happened.

---

## 4.4 — Losing signal doesn't burn retry attempts

**What:** being offline for a long time used to count against the 5 retries
(long enough offline = data deleted). Now network failures don't count at all.

**Steps** (Android):
1. Airplane mode on, queue 2–3 scans.
2. Leave Airplane mode **on for a few hours** (or overnight), using the app
   occasionally so sync attempts happen.
3. Reconnect.

**Pass:** everything syncs — nothing was dropped or parked as failed no matter
how long you stayed offline.

---

# Batch 5 tests — CI hardening

These checks happen on GitHub, not the server. Open
`https://github.com/Snookylagoon/Vairiot/actions` in your browser.

## 5.1 — The pipeline goes green

**What:** every push now runs lint + type-checks for all five TS workspaces,
the API test suite, a Docker image build for all five services, and the
Android build — all on Node 22 (same as production; the mismatch is gone).

**Steps:**
1. Open the **Actions** tab and click the newest "Vairiot CI" run on this
   branch.
2. Look at the job list.

**Pass:** you see green ticks on **Lint & Type-check**, **API Tests**,
**Docker api / worker / web / admin / reports**, and **Android Build & Lint**.

**Fail:** any job is red. Click it, copy the last ~30 lines of the failing
step, and send them to me.

---

## 5.2 — Broken code is actually blocked

**What:** prove the gate isn't decorative.

**Steps:** make a deliberately bad change on a throwaway branch:
```
git checkout -b ci-smoke-test
echo "const unused_variable = 1;" >> vairiot-api/src/app.ts
git commit -am "ci smoke test" && git push -u origin ci-smoke-test
```
Open a pull request for it on GitHub and watch the checks.

**Pass:** the **Lint & Type-check** job fails (unused variable), and the PR
shows a red ✗. Delete the branch afterwards (close the PR,
`git push origin --delete ci-smoke-test`).

---

## 5.3 — Images are published for pull-based deploys

**What:** on every push to `main`, CI now publishes ready-built Docker images
to GitHub's registry (GHCR). This is the foundation for faster deploys with
instant rollback — the server will eventually `docker compose pull` instead of
building from source (that switch is a later, separate step; nothing about
today's deploys changes yet).

**Steps** (only after this branch is merged to `main`): on the repo page,
right-hand side, click **Packages**.

**Pass:** you see `vairiot-api`, `vairiot-worker`, `vairiot-web`,
`vairiot-admin`, `vairiot-reports` packages, each with a `latest` tag and one
tagged with the commit hash.

---

## 5.4 — Dependency update PRs appear

**What:** Dependabot now watches npm, Python, Gradle, Docker, and the CI
actions themselves, and opens small update PRs weekly (Mondays).

**Pass:** within a week of merging you see a few PRs authored by
`dependabot[bot]`. Nothing to do now — just merge them when CI is green.

---

*(Later batch test procedures are added below as each part lands.)*
