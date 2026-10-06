# Sprint 0 — Hardening and hosting (weeks 1–2)

**Goal:** field crews can trust the apps, production can be restored, and TUDA has its own environment. Feeds TOR Deliverable D1.

**Fit-gap items:** 16 (offline), 10 (register profiling, first pass).

**Branch:** `feature/s0-hardening`

---

## Prompt S0.1 — Branch, baseline and audit triage

```
Set up the S0 hardening sprint for Vairiot Asset Intelligence and triage the July 2026 platform audit.

Context:
- Repository: /Volumes/DRSssd/Projects/GitHub/Vairiot-dev (npm workspaces: vairiot-api, vairiot-web, vairiot-admin, vairiot-worker, vairiot-shared, vairiot-reports, vairiot-mobile, vairiot-ios)
- Stack: Node 22, Express, Prisma 5 on PostgreSQL, React 18 + Vite, BullMQ on Redis, MinIO, Kotlin/Jetpack Compose (Android), SwiftUI (iOS), Python FastAPI (reports)
- Audit: docs/AUDIT-2026-07-19.md lists security, SaaS, offline, communications, storage and infrastructure findings
- Registry: docs/known-fix-registry.md records every bug fixed

Steps:
1. Create and check out the branch feature/s0-hardening from develop.
2. Run `npm install`, `npm run lint` and `npm test` and record the baseline results (pass/fail counts per workspace).
3. Read docs/AUDIT-2026-07-19.md in full. For every finding, check the current code and classify it as FIXED, PARTLY FIXED or OPEN, citing the file and line that proves the status. Known fixes to confirm: AuditScanEvent.capturedAt, Asset.clientRequestId and AuditScanEvent.clientRequestId, WebhookDelivery model, infra/backup.sh and infra/restore.sh.
4. Write the result to docs/sprints/S0-audit-triage.md as a table: ID, finding, status, evidence, sprint prompt that closes it (S0.2 to S0.6), or "deferred" with a reason.
5. Commit with the message "S0.1: audit triage and sprint baseline".

Output:
- docs/sprints/S0-audit-triage.md
- Baseline lint and test results (short table in the reply)
- Files changed, with full paths

Think before answering (maximum reasoning).
```

**Acceptance:** `docs/sprints/S0-audit-triage.md` exists; every audit finding has a status and evidence.

---

## Prompt S0.2 — Offline queue: never lose field work (Android)

```
Fix the Android offline queue in vairiot-mobile so no queued scan, asset or photo is ever silently deleted.

Context:
- Path: /Volumes/DRSssd/Projects/GitHub/Vairiot-dev/vairiot-mobile/app/src/main
- Relevant files: QueuedScan.kt, QueuedScanDao.kt, QueuedAsset.kt, QueuedAssetDao.kt, ScanSyncWorker.kt, AssetSyncWorker.kt, AuditRunViewModel.kt, NetworkModule.kt, VairiotApp.kt, TokenStore.kt
- Audit findings: queued items are dropped after 5 failed attempts; network errors count as attempts; cold start wipes the token so workers 401 before login; blind-audit scans were queued without locationId and condition; offline photos are discarded
- Server idempotency keys already exist: Asset.clientRequestId and AuditScanEvent.clientRequestId

Steps:
1. Add a `state` column to QueuedScan and QueuedAsset with values PENDING, FAILED, DEAD and a `lastError` text column. Write the Room migration.
2. Change both sync workers so that: a network error (IOException, timeout, 5xx) does not increment attempts; a 4xx other than 401/409 moves the row to DEAD with the server message in lastError; a 409 with an existing record is treated as success; 401 pauses the worker until a valid token exists. Remove every code path that deletes a row on failure.
3. Send clientRequestId on every asset create and scan replay; generate it once when the row is queued, never on replay.
4. Persist and replay locationId, condition and capturedAt for blind-audit scans.
5. Stop VairiotApp.kt clearing tokens on cold start and stop NetworkModule.kt clearing tokens on a refresh 5xx; clear only on a genuine 401 rejection of the refresh token.
6. Add QueuedPhoto (file path on device, assetId or scan clientRequestId, state) with its DAO, capture-to-disk in AssetPhotosViewModel, and a PhotoSyncWorker that drains it with the same rules.
7. Add a "Pending uploads" section to ProfileScreen.kt showing counts by state, with Retry and Discard actions for DEAD rows (Discard asks for confirmation).
8. Add unit tests for the attempt and state rules using MockScannerService and a fake API.
9. Record each fix in docs/known-fix-registry.md.

Output:
- Room migration, updated entities, DAOs, workers, view models and screen
- Unit tests passing under `./gradlew testDebugUnitTest`
- Files changed, with full paths

Think before answering (maximum reasoning).
```

**Acceptance:** `cd vairiot-mobile && ./gradlew testDebugUnitTest` passes; airplane-mode test on a device shows scans surviving a reboot and syncing when back online.

---

## Prompt S0.3 — Offline queue: iOS parity

```
Bring the iOS app (vairiot-ios) to the same offline rules as Android after S0.2.

Context:
- Path: /Volumes/DRSssd/Projects/GitHub/Vairiot-dev/vairiot-ios/VairiotMobile
- Storage: SwiftData; connectivity via NWPathMonitor; queue drains on reconnect and foreground
- Gaps from the audit: no background sync; photos captured offline are lost; no RFID sessions or blind-audit zones on iOS (out of scope here); drop-after-5-attempts rule

Steps:
1. Apply the same queue state model (PENDING, FAILED, DEAD, lastError) to the SwiftData queue entities and remove deletion on failure.
2. Apply the attempt rules from S0.2 (network errors do not count; 409 = success; 401 pauses).
3. Add a QueuedPhoto entity and drain it with the asset and scan queues.
4. Add a BGProcessingTask that drains all queues in the background, registered in VairiotApp.swift and Info.plist.
5. Add a "Pending uploads" section to Screens/Profile/ProfileView.swift with Retry and Discard.
6. Add tests for the state rules.
7. Record fixes in docs/known-fix-registry.md.

Output:
- Updated models, sync code, background task, profile screen and tests
- Files changed, with full paths

Think before answering (maximum reasoning).
```

**Acceptance:** project builds in Xcode (`xcodebuild -scheme VairiotMobile -destination 'platform=iOS Simulator,name=iPhone 16' build`); tests pass.

---

## Prompt S0.4 — Server-side sync hardening and rate limits

```
Harden the vairiot-api for fleets of scanners flushing offline queues.

Context:
- Path: /Volumes/DRSssd/Projects/GitHub/Vairiot-dev/vairiot-api/src
- Audit findings: in-memory rate limiting and lockout counters block multiple API replicas; the global limiter (100 req/min per IP) throttles NAT'd scanner fleets; no compression; full-register re-download on every refresh; replayed scans need server-side sanity clamp on capturedAt
- Redis is already deployed for BullMQ and the JWT blacklist

Steps:
1. Replace the in-memory express-rate-limit store and the login-lockout counters with rate-limit-redis / Redis keys. Give authenticated sync routes (POST /assets, POST /audits/:id/scans, POST /scan-sessions, POST /photos) a separate, per-user limit of 600 req/min instead of the per-IP global limit.
2. Add gzip compression (compression middleware) for JSON responses.
3. Add `GET /api/v1/assets?changedSince=<ISO>` returning only assets with updatedAt after the timestamp, plus soft-deleted IDs since that time, so mobile can delta-sync. Document it in the OpenAPI spec.
4. Confirm POST /audits/:id/scans clamps capturedAt to [campaign.startedAt − 1 day, now] and that a duplicate clientRequestId returns 200 with the existing event rather than 409.
5. Confirm POST /assets with a duplicate (tenantId, clientRequestId) returns the existing asset with 200.
6. Add Jest tests for each behaviour above.
7. Update vairiot-mobile AssetRepository.kt and vairiot-ios AssetRepository to use changedSince and to show "Last synced X minutes ago" in the asset list header.

Output:
- API changes with OpenAPI updates and tests
- Mobile delta-sync changes on both platforms
- Files changed, with full paths

Think before answering (maximum reasoning).
```

**Acceptance:** `npm test --workspace=vairiot-api` passes; `docker compose -f infra/docker-compose.yml up` and two API replicas share lockout state (verify by failing login 6 times across replicas).

---

## Prompt S0.5 — Backups, monitoring and deploy safety

```
Make production restorable and observable.

Context:
- Path: /Volumes/DRSssd/Projects/GitHub/Vairiot-dev/infra and scripts
- Existing: infra/backup.sh, infra/restore.sh, infra/backup.crontab, docker-compose.prod.yml, nginx/prod.conf, scripts/go-live.sh, deploy.sh
- Audit findings to close: no verified off-site backup; migrations not run on deploy; no healthchecks or resource limits; no log rotation; nginx caches upstream IPs (502 after deploy); no certbot deploy-hook; minio image unpinned; no uptime or error alerting

Steps:
1. Review backup.sh: it must dump Postgres (pg_dump custom format), mirror the three MinIO buckets, copy Redis RDB, and encrypt the archive with age or gpg using a key from .env. Add off-site upload to an S3-compatible target (variables BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, keys) with 30 daily and 12 monthly retention. Keep infra/backup.crontab in step.
2. Add infra/restore-test.sh that restores the latest backup into a throwaway docker compose stack (compose project name vairiot-restoretest), runs `prisma migrate status` and a row-count check per table, then tears down. Document how to run it monthly in DEPLOY.md.
3. In deploy.sh: run `npm run db:deploy --workspace=vairiot-api` before starting containers; fail the deploy if the migration fails; add `docker compose up -d --wait` and a post-deploy curl of /health/ready.
4. In docker-compose.prod.yml: add healthcheck blocks for api, worker, web, admin, nginx, postgres, redis, minio; add memory limits; add json-file log rotation (max-size 20m, max-file 5); pin minio/minio to a dated tag.
5. In nginx/prod.conf: add `resolver 127.0.0.11 valid=10s;` with variable proxy_pass so container IP changes do not need a restart; add HSTS to the SPA vhosts; add a certbot deploy-hook that reloads nginx.
6. Add an uptime check and error tracking: wire Sentry (or GlitchTip, self-hosted) DSN into api, worker and web via env; add an UptimeRobot-style external check instruction to DEPLOY.md; add a BullMQ failed-job alert (email via existing mailer) in vairiot-worker/src/monitoring.ts.
7. Add a Dependabot config for npm, pip and docker if missing.

Output:
- Updated infra scripts, compose files, nginx config, DEPLOY.md
- Files changed, with full paths

Think before answering (maximum reasoning).
```

**Acceptance:** `bash infra/restore-test.sh` completes with matching row counts; `docker compose -f infra/docker-compose.prod.yml config` validates; every service shows `healthy` after `up`.

---

## Prompt S0.6 — TUDA tenant, environments and register profiling tool

```
Create the TUDA tenant, three environments and a legacy register profiling tool.

Context:
- Path: /Volumes/DRSssd/Projects/GitHub/Vairiot-dev
- Tenant model supports deploymentMode (standalone, saas, hybrid), licence tiers and feature flags; seed is vairiot-api/prisma/seed.ts
- Environments: dev (local docker), staging (infra/docker-compose.staging-shared.yml), production; TUDA may require in-country hosting, so the standalone mode must work on one server
- Import service: vairiot-api/src/services/import.service.ts (CSV only)

Steps:
1. Add a seed profile `seed:tuda` that creates tenant "TUDA — Tbilisi Transport and Urban Development Agency" in standalone mode with: currency GEL, country GE, timezone Asia/Tbilisi, feature flags gis=true, ipsas=true, reconciliation=true; roles Administrator, Finance, Inventory Manager, Field Operator, Verifier, Viewer; one admin user from env TUDA_ADMIN_EMAIL.
2. Add infra/docker-compose.standalone.yml: single host, Postgres with PostGIS image (postgis/postgis:16-3.4), Redis, MinIO, api, worker, web, admin, reports, nginx; no public registration (env ALLOW_REGISTRATION=false); backups from S0.5 enabled.
3. Add scripts/profile-register.py (Python 3, pandas, openpyxl): reads an Excel or CSV register, reports per column: fill rate, distinct count, sample values, detected type; flags duplicate asset numbers, blank names, non-numeric costs, dates outside 1990–today; writes an Excel profile report (A4 landscape) and a suggested column-mapping JSON for the S2 importer. Include a sample file under scripts/samples/.
4. Document all three in DEPLOY.md and docs/STAGING-SETUP.md.

Output:
- Seed profile, standalone compose file, profiling script with sample, documentation
- Files changed, with full paths

Think before answering (maximum reasoning).
```

**Acceptance:** `npm run seed:tuda --workspace=vairiot-api` creates the tenant; `python3 scripts/profile-register.py scripts/samples/register-sample.xlsx` writes a profile report.

---

## Prompt S0.7 — Sprint close

```
Close sprint S0 on branch feature/s0-hardening.

Steps:
1. Run `npm run lint`, `npm test`, `cd vairiot-mobile && ./gradlew testDebugUnitTest` and fix anything failing.
2. Update docs/sprints/S0-audit-triage.md so every finding closed in this sprint reads FIXED with the commit hash.
3. Update docs/known-fix-registry.md with every bug fixed in S0.
4. Write docs/sprints/S0-summary.md: what changed, how to verify, what remains open, and the full list of files changed in the sprint.
5. Open a pull request from feature/s0-hardening to develop with that summary as the description.

Output:
- docs/sprints/S0-summary.md
- Pull request URL

Think before answering (maximum reasoning).
```

---

## Sprint checklist

- [ ] S0.1 Audit triage
- [ ] S0.2 Android offline queue
- [ ] S0.3 iOS offline parity
- [ ] S0.4 Server sync hardening
- [ ] S0.5 Backups, monitoring, deploy safety
- [ ] S0.6 TUDA tenant, standalone compose, register profiler
- [ ] S0.7 Sprint close and PR merged
