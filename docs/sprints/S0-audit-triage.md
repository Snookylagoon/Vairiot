# S0 — Audit triage (docs/AUDIT-2026-07-19.md)

**Triaged:** 5 October 2026, branch `feature/s0-hardening` (from `dev` at `16df41e`). The audit was taken at `05c05f9`.

**Headline:** most of the audit's existential items were closed by the `audit-remediation` PR (Snookylagoon/Vairiot#5, merged as `d0095b9`), mainly in commits `326c2c5` (backups, compose, nginx, nodemailer), `3212e65` (security mediums), `1ac56d0` (offline-sync integrity), `7aad685` (notification scheduler) and `80ecac2` (Redis rate limits, durable webhooks, metering). The S0 prompts were written as if that work had not happened, so several steps are now "confirm and finish" rather than "build".

What remains open and matters most:

1. **iOS blind audits fail online and offline.** iOS never sends `locationId` with a scan, and the server rejects blind scans without one. Not covered by any S0 prompt as written. Assigned to S0.3.
2. **SEC-H2 (high) is still open.** The public UDID enrolment endpoint does not verify the PKCS#7 signature. Not covered by any S0 prompt. Assigned to S0.4.
3. **Duplicates after a timeout.** Online (non-queued) creates and scans send no `clientRequestId`. If the response is lost, the queued retry gets a new key and creates a duplicate. Assigned to S0.2 and S0.3.
4. **Offline photos are still lost** on both platforms (S0.2, S0.3).
5. **Backups skip Redis**, and the crontab still has the placeholder `BACKUP_AGE_RECIPIENT=age1REPLACE_ME`, so production backups are unencrypted unless the server's crontab was edited by hand (S0.5).

Status key: **FIXED** = closed in current code; **PARTLY FIXED** = some of it is done, with the gap named; **OPEN** = not done. Line numbers are against `16df41e`.

---

## Known fixes named in the S0 plan

| Item | Status | Evidence |
|---|---|---|
| `AuditScanEvent.capturedAt` | FIXED | `vairiot-api/prisma/schema.prisma:461`; clamp in `vairiot-api/src/services/audit.service.ts:168-178` (commit `1ac56d0`) |
| `Asset.clientRequestId` | FIXED | `schema.prisma:320`, unique `(tenantId, clientRequestId)` at `:342` |
| `AuditScanEvent.clientRequestId` | FIXED | `schema.prisma:464`, unique **globally** (not per tenant; harmless for UUIDs) |
| `WebhookDelivery` model | FIXED | `schema.prisma:707`; worker `vairiot-worker/src/processors/webhook-deliver.ts` (commit `80ecac2`) |
| `infra/backup.sh`, `infra/restore.sh` | PARTLY FIXED | Both exist (commit `326c2c5`, tar fix `2332af7`). Gaps are in STO-1 below |

---

## 1. Security

| ID | Finding | Status | Evidence | Closed by |
|---|---|---|---|---|
| SEC-H1 | nodemailer ≤ 9.0.0 advisories | FIXED | `vairiot-api/package.json:38` and `vairiot-worker/package.json:17` `^9.0.3`; lockfile resolves 9.1.1 (`package-lock.json:12318`) | `326c2c5` |
| SEC-H2 | Public iOS UDID enrolment parses PKCS#7 without verifying the signature | **OPEN** | `vairiot-api/src/routes/ios/ios.router.ts:321-345` (comment says "without verifying the signature"); mounted publicly at `vairiot-api/src/app.ts:82`; only the global limiter applies | **S0.4** (added: verify the signature against the Apple CA, add a dedicated rate limit) |
| SEC-M1 | 2FA secrets and backup codes in plaintext | FIXED | `vairiot-api/src/services/two-factor.service.ts:55-61` encrypts the secret and bcrypt-hashes the codes | `3212e65`. Leftover: legacy plaintext rows are still accepted (`:15-22`) and nothing re-encrypts them. Deferred, low risk |
| SEC-M2 | Password policy: exactly 12, alphanumeric only | FIXED | `vairiot-api/src/services/password-policy.service.ts:4-50`: minimum 12, any characters, 3 classes or a 16+ passphrase, blocklist | `3212e65`. Leftover: login validates `min: 8` (`auth.router.ts:24`, harmless) and there is no breach-list check. Deferred |
| SEC-M3 | API and worker use MinIO root credentials | PARTLY FIXED | `vairiot-api/src/lib/minio.ts:13-16` prefers `MINIO_ACCESS_KEY` but falls back to root; `infra/docker-compose.prod.yml:117-120` still passes root | **S0.5** (provision a scoped service account in compose and the env template) |
| SEC-M4 | Refresh rotation leaves the old token valid | FIXED | `vairiot-api/src/services/auth.service.ts:142-151`: reuse detection plus blacklisting the presented `jti` | `3212e65` |
| SEC-M5 | One shared JWT secret; no minimum length | PARTLY FIXED | `vairiot-api/src/lib/jwt.ts:11-21`: separate secrets supported, but they fall back to `JWT_SECRET` and too-short secrets only log a warning | Deferred to S1 hardening: make it fail hard in production. Needs the production `.env` updated first, otherwise the deploy breaks |
| SEC-M6 | `APP_ENCRYPTION_KEY` undocumented; static salt; 16-char minimum | **OPEN** | `vairiot-api/src/lib/crypto.ts:5` static salt `'vairiot-smtp-v1'`, `:12-13` 16-char minimum; missing from `.env.example` and `infra/.env.prod.example` | **S0.5** (document it in the env templates). Changing the salt needs a re-encryption migration, so that part is deferred |
| SEC-L1 | APK/IPA downloads public, no rate limit | OPEN | `vairiot-api/src/routes/mobile/mobile.router.ts:36`, `ios.router.ts:83` | **S0.4** (dedicated limiter alongside the sync-route limits) |
| SEC-L2 | No HSTS on SPA vhosts | FIXED | `infra/nginx/prod.conf:67`, `:110` | `326c2c5` |
| SEC-L3 | Android tokens in plain DataStore | OPEN | `vairiot-mobile/app/src/main/java/com/vairiot/app/data/local/TokenStore.kt:15`; `AndroidManifest.xml:31` `allowBackup="true"` | Deferred: not in S0.2 scope; needs a migration path for signed-in users. Recommend S1 |
| SEC-L4 | No certificate pinning | OPEN | `vairiot-mobile/app/src/main/res/xml/network_security_config.xml` has no `<pin-set>`; nothing in iOS | Deferred: pinning risks locking out installed apps on cert rotation; decide with the hosting move |
| SEC-L5 | `innerHTML` in label printing | FIXED | `vairiot-web/src/pages/labels/LabelsPage.tsx:467-469` prints canvas-rendered PNGs only; no `innerHTML` left in `vairiot-web/src` | Label rewrite (`cfb0823` and later) |

## 2. SaaS capability

| ID | Finding | Status | Evidence | Closed by |
|---|---|---|---|---|
| SAAS-1 | No payment gateway | OPEN | No Stripe/Paddle dependency or code | Deferred: business decision; not TUDA-relevant (standalone) |
| SAAS-2 | No staging environment | FIXED | `infra/docker-compose.staging-shared.yml`, `docs/STAGING-SETUP.md`, `infra/deploy.sh:32-38` | `6316cab`, `9b58f99`. S0.6 adds the standalone (TUDA) profile |
| SAAS-3 | Migrations not run on deploy | FIXED | `infra/docker-compose.prod.yml:69-86` one-shot `migrate` service; api `depends_on` it with `service_completed_successfully` | `326c2c5`. S0.5 step 3 should keep this service, not add a second migrate path |
| SAAS-4 | In-memory rate limiting and lockout | FIXED | `vairiot-api/src/middleware/rate-limit.ts:2,10-18` RedisStore; lockout lives in the DB (`services/login-protection.service.ts:8-23`) | `80ecac2`. S0.4 step 1 reduces to the per-user sync limiter |
| SAAS-5 | No DB-level tenant isolation | OPEN | `vairiot-api/src/lib/prisma.ts:17-23` plain client; no RLS; no cross-tenant fuzz test | Deferred: large change; schedule before the second SaaS tenant onboards |
| SAAS-6 | Webhooks fire-and-forget | FIXED | `schema.prisma:707`; `webhook.service.ts:67-77`; worker HMAC and retries at `webhook-deliver.ts:34-79` | `80ecac2`. Leftover: direct `fetch` fallback when enqueue fails (`webhook.service.ts:81-89`) |
| SAAS-7 | Mobile server URL hardcoded | OPEN | `vairiot-mobile/app/build.gradle.kts:42,79`; `vairiot-ios/VairiotMobile/API/APIClient.swift:48` | Deferred, **but a TUDA blocker** if TUDA is hosted in-country on its own domain. Needs a build flavour or a runtime server picker. Flag for S1 |
| SAAS-8 | No usage metering | PARTLY FIXED | `schema.prisma:729` `TenantUsage`; `vairiot-worker/src/processors/storage-metering.ts` nightly | `80ecac2`. No API reads it and no quota is enforced. Deferred |
| SAAS-9 | Thin white-label; global SMTP | OPEN | `schema.prisma:1100` `SmtpConfig` singleton; `vairiot-worker/src/mailer.ts:23` | Deferred (irrelevant in standalone mode) |
| SAAS-10 | Global OTA channel | OPEN | `schema.prisma:1050-1065` `MobileRelease.isCurrent` with no tenant or rollout fields | Deferred |

## 3. Online/offline

| ID | Finding | Status | Evidence | Closed by |
|---|---|---|---|---|
| OFF-1 | Drop-after-5 deletes queued work | PARTLY FIXED | Android: `QueuedScan.kt:7-11,24` state column, `QueuedScanDao.kt:23-24` `markDead` (UPDATE, not DELETE), `sync/SyncFailure.kt:18-24` network/auth errors don't count, Profile retry/discard (`ProfileScreen.kt:93-97,161-167`). iOS: `Data/SyncManager.swift:121-172` dead parking; `ProfileView.swift:49-91` | `1ac56d0`. **S0.2/S0.3:** (a) `DatabaseModule.kt:51` still has `fallbackToDestructiveMigration()`, so one missed migration wipes every queue; remove it. (b) There is no `lastError` column and no per-item view; retry and discard act on all rows. (c) 409 handling differs from the plan's rule; reconcile it. The plan's PENDING/FAILED/DEAD model is a refinement of what exists, not a rewrite |
| OFF-1b | Cold-start token wipe; workers 401 before login | FIXED | `vairiot-mobile/.../VairiotApp.kt:25-36` (no wipe); `ScanSyncWorker.kt:31-34` skips when signed out | `1ac56d0` |
| OFF-2 | Blind-audit scans queued without `locationId`/`condition` | PARTLY FIXED | Android fixed: `AuditRunViewModel.kt:166-174`, replayed at `ScanSyncWorker.kt:53-54`. **iOS broken:** `vairiot-ios/VairiotMobile/Screens/Audits/AuditRunViewModel.swift:76` (online) and `:111` (queued) send only `tagValue`; the server requires `locationId` (`vairiot-api/src/services/audit.service.ts:203-205`) | `326c2c5` (Android). **S0.3** (added step: send zone `locationId` and condition on iOS online and queued scans). Android leftover for **S0.2**: the online catch at `AuditRunViewModel.kt:~199` treats a 400/409 as "Queued offline" |
| OFF-3 | No idempotency on replay | PARTLY FIXED | Server dedupes: `asset.service.ts:235-264`, `audit.service.ts:187-196,237-249`. Clients send the key on replay: `ScanSyncWorker.kt:55`, `AssetSyncWorker.kt:56`, `SyncManager.swift:141` | `1ac56d0`. **S0.2/S0.3:** online calls send no key (Android `AuditRunViewModel.kt:177-181`, `AssetScanViewModel.kt:196-198`; iOS `AuditRunViewModel.swift:76`). Generate the key before the first attempt and reuse it when queueing. **S0.4:** duplicates currently return **201** with the existing record; the plan asks for 200. Choose one; changing it touches both clients |
| OFF-4 | Offline photos lost | **OPEN** | No `QueuedPhoto` on either platform; `AssetPhotosViewModel.kt:77-78`, iOS `AssetPhotosView.swift:~136` | **S0.2** (Android), **S0.3** (iOS) |
| OFF-5 | Android clears tokens on refresh 5xx | FIXED | `vairiot-mobile/.../di/NetworkModule.kt:57-68`: clears only on 401/403 | `1ac56d0` |
| OFF-6 | No iOS background sync | **OPEN** | No `BGTaskScheduler` or `UIBackgroundModes`; foreground only (`App/VairiotApp.swift:18,32-35`) | **S0.3** |
| OFF-7 | Replayed scans get server timestamps | PARTLY FIXED | `capturedAt` stored and clamped (`audit.service.ts:168-178`); sent by Android (`ScanSyncWorker.kt:56`) and iOS (`SyncManager.swift:142`) | `1ac56d0`. **S0.4:** the current clamp is [now − 90 days, now + 10 min]; the plan wants [campaign.startedAt − 1 day, now]. Tighten it and add tests. Check that reports use `capturedAt` |
| OFF-8 | No delta sync; no "last synced" label | **OPEN** | No `changedSince` in API or clients | **S0.4** |
| OFF-9 | Platform parity | PARTLY FIXED | Android lacks reference-data cache, provisional rows and a connectivity monitor; iOS lacks RFID sessions; `SyncManager.pendingCount` (`SyncManager.swift:44-50`) is unused by any view | **S0.3** covers the iOS pending-uploads UI. The rest is deferred to S1/S3 (blind-audit zones are S3) |
| OFF-10 | Web/admin online-only | OPEN | No service worker | Deferred (accepted in the audit) |

## 4. Communications

| ID | Finding | Status | Evidence | Closed by |
|---|---|---|---|---|
| COM-1 | No compression | PARTLY FIXED | nginx `gzip on` (`infra/nginx/prod.conf:10-15`); no `compression` middleware in `vairiot-api/src/app.ts` | `326c2c5`. **S0.4** adds API middleware (needed for standalone installs without the prod nginx) |
| COM-2 | Validation not schema-first | OPEN | express-validator across 19 files; zod only in `lib/feature-flags.ts` | Deferred: refactor, no defect |
| COM-3 | No server/proxy timeouts | OPEN | `vairiot-api/src/index.ts:21` plain `listen`; no `proxy_*_timeout` in nginx | **S0.5** (proposed addition: set `headersTimeout`/`keepAliveTimeout` above nginx's) |
| COM-4 | Global 100/min per IP throttles NAT'd fleets | **OPEN** | `vairiot-api/src/middleware/rate-limit.ts:31-39` no `keyGenerator`; applied at `app.ts:57` | **S0.4** step 1 |
| COM-5 | Alert digests never fire | FIXED | `vairiot-worker/src/index.ts:104-171` job schedulers; `processors/notification-scheduler.ts:38-155` | `7aad685` |
| COM-6 | No push/SMS | OPEN | No FCM/APNs/SMS dependencies | Deferred |
| COM-7 | Dead `/ws/` nginx config | PARTLY FIXED | Removed from `prod.conf`; still at `infra/nginx/dev.conf:16-21` | Deferred (dev only, harmless) |
| COM-8 | No dead-letter alerting; enqueue errors swallowed | PARTLY FIXED | `vairiot-worker/src/index.ts:20-26` sends exhausted jobs to Sentry (only if `SENTRY_DSN` is set); `vairiot-api/src/lib/queue.ts:85-120` still log-and-continue | `326c2c5`. **S0.5** step 6 (email alert on failed jobs) |

## 5. Storage

| ID | Finding | Status | Evidence | Closed by |
|---|---|---|---|---|
| STO-1 | No backups | PARTLY FIXED | `infra/backup.sh:58` `pg_dump -Fc`, `:67-72` MinIO mirror, `:82` `.env`, `:89-90` age (optional), `:101-105` rclone off-site (optional); `infra/restore.sh`; `infra/backup.crontab` daily 02:30 | `326c2c5`. **S0.5:** (a) Redis is not backed up. (b) `backup.sh:70` `\|\| true` hides a failed bucket mirror. (c) The crontab ships `BACKUP_AGE_RECIPIENT=age1REPLACE_ME`. (d) Retention is not 30 daily / 12 monthly. (e) No tested restore (restore-test.sh) |
| STO-2 | No presigned URLs | OPEN | Files streamed through the API (`photos.router.ts:92`, `document.service.ts:57`) | Deferred (performance, not correctness) |
| STO-3 | No lifecycle/versioning; orphaned blobs | OPEN | `lib/minio.ts:19-43`; `photo.service.ts:167,169` `.catch(() => {})` | Deferred |
| STO-4 | `AuditEvent` unbounded | OPEN | `schema.prisma:185`, no retention | Deferred (an IPSAS audit trail probably *should* be kept; decide in S2) |
| STO-5 | No whole-tenant export | OPEN | Per-report exports only | Deferred (S5 handover candidate) |
| STO-6 | `ReportSchedule` dead stub | OPEN | `schema.prisma:747-763`, referenced only by tenant purge | Deferred (S5 reporting) |
| STO-7 | No server-side image processing | OPEN | Client thumbnails stored as-is (`photo.service.ts:75-80`); no EXIF/GPS strip | Deferred to S1 (condition photos). GPS may be *wanted* for GIS |

## 6. Infrastructure and operations

| ID | Finding | Status | Evidence | Closed by |
|---|---|---|---|---|
| INF-1 | Manual build-on-prod deploy, no rollback | PARTLY FIXED | CI pushes GHCR images (`.github/workflows/ci.yml:136-182`) but prod compose uses `build:` and `infra/deploy.sh:43-46` pulls and builds on the box | **S0.5** step 3 (`--wait`, health curl). Registry-based deploys with rollback are deferred |
| INF-2 | nginx caches upstream IPs | FIXED | `infra/nginx/prod.conf:7` resolver; variable `proxy_pass` at `:72-126` | `326c2c5` |
| INF-3 | CI gaps | PARTLY FIXED | ESLint `ci.yml:40-41`, Docker builds, Node 24 everywhere. No tests run in CI for worker, admin, shared or web; CI doesn't gate `go-live.sh` | Deferred to S0.7/S1 (cheap win: add `vairiot-shared` jest and `vairiot-web` vitest to CI) |
| INF-4 | No healthchecks | PARTLY FIXED | Present: postgres `:24`, redis `:39`, minio `:59`, api `:126`, reports `:143`, worker `:212`, nginx `:237`. **Missing: web (`:149`), admin (`:164`)**. `DEPLOY.md:65` wrongly says every container has one | **S0.5** step 4 |
| INF-5 | No resource limits | FIXED | `mem_limit` on every long-running service in `docker-compose.prod.yml` | `326c2c5` |
| INF-6 | No log rotation | FIXED | `docker-compose.prod.yml:4-8` json-file anchor (10m × 3) | `326c2c5`. The plan asks for 20m × 5; adjust in S0.5 if wanted |
| INF-7 | No error tracking or uptime monitoring | PARTLY FIXED | Sentry in api (`src/lib/monitoring.ts:12`) and worker (`src/monitoring.ts:11`), no-op without a DSN; none in web; uptime check documented only (`DEPLOY.md:67`) | **S0.5** step 6 (web Sentry, confirm the DSN is set in prod, failed-job email) |
| INF-8 | No certbot deploy-hook | **OPEN** | `infra/deploy.sh:13-17` comment only | **S0.5** step 5 (commit the hook script; installing it on the server is a manual step) |
| INF-9 | `minio/minio:latest` unpinned | FIXED | Pinned `RELEASE.2025-09-07T16-13-09Z` in `docker-compose.prod.yml:48`, `docker-compose.yml:39`, `docker-compose.infra.yml:40` | `326c2c5`. `nginx:alpine`, `postgres:16-alpine` and `redis:7-alpine` still float; pin in S0.5 |
| INF-10 | Prisma 5.22 forces a Node mismatch | FIXED | Prisma `^7.10.0` (`vairiot-api/package.json:22,61`); `node:24-alpine` in all Dockerfiles and CI | `a6df1ff`, `0e17ee5` |
| INF-11 | No Dependabot | FIXED | `.github/dependabot.yml`: npm, pip, gradle, github-actions, docker | `06a7d33`. Docker covers only `/vairiot-api`; S0.5 step 7 adds the other Dockerfiles |
| INF-12 | No CDN | OPEN | — | Deferred (hosting decision; not relevant to in-country TUDA) |
| INF-15 | *New (found in S0.5).* MinIO image no longer obtainable | FIXED (S0.5): built from source | `minio/minio` (pinned `RELEASE.2025-09-07T16-13-09Z`, `latest`, older tags) and `quay.io/minio/minio` no longer resolve (checked 6 Oct 2026; `postgres:16-alpine` resolves fine from the same machine). Production runs from its cached image. | **Blocks any rebuild**: a new server, S0.6's standalone TUDA install, or disaster recovery can't start the object store. Options: build MinIO from source into our own registry; a maintained third-party image (e.g. `cgr.dev/chainguard/minio`); another S3-compatible store; or managed S3 (audit Option A). **Decision: build from source.** `infra/minio/Dockerfile` (tag + commit pinned, MinIO `RELEASE.2025-10-15T17-29-55Z`, which also fixes GHSA-jjjj-jwhf-8rgr, plus `mc`), used by all compose files with `pull_policy: build`, built and published to GHCR by CI. Verified: data written by prod's 2025-09-07 image read back intact; full backup/restore test passes |

---

## Plan vs repository discrepancies (fix before running S0.2–S0.7)

| Plan says | Repository has | Action |
|---|---|---|
| Branch from `develop` | No `develop` branch; work happens on `dev` (`ci.yml:4-12`) | Branched from `dev`; S0.7 PR targets `dev` |
| Node 22, React 18, Prisma 5 | Node 24, React 19, Prisma 7 | Ignore the stated versions |
| Workspaces include reports, mobile, ios | npm workspaces are api, web, admin, worker, shared only (`package.json:5-11`) | `npm test` never touches reports, Android or iOS |
| `deploy.sh` at the repo root | `infra/deploy.sh` | Use `infra/deploy.sh` in S0.5 |
| S0.5: run `db:deploy` in deploy.sh | Migrations already run via the compose `migrate` service | Keep the service; don't add a second migrate path |
| S0.4: per-IP limiter and lockout in memory | Already Redis or DB backed | S0.4 step 1 is only the per-user sync limiter |
| S0.4: duplicate returns 200 | Returns 201 with the existing record | Decide; keep 201 unless there's a reason |
| S0.4 acceptance: `npm test --workspace=vairiot-api` | Needs a migrated test DB; the safe runner is `scripts/test-api.sh` (Docker) | Use `npm run test:api` |

## Baseline (5 October 2026, `16df41e`)

| Workspace | Lint | Tests |
|---|---|---|
| repo-wide (`npm run lint`) | 0 errors, 73 warnings | — |
| vairiot-api | (in repo-wide lint) | **88 failed / 96 passed / 184** (10 of 18 suites failed). Not a code failure: bare `npm test` used the local dev DB `localhost:5432/vairiot_dev`, which is behind on migrations (`assets.individualAssetReference` missing). Docker was not running, so `scripts/test-api.sh` (isolated DB) could not run. Jest also hung on open handles and had to be killed |
| vairiot-web | — | 8 / 8 passed (vitest, 2 files) |
| vairiot-shared | — | 42 / 42 passed (2 suites) |
| vairiot-admin | — | no test script |
| vairiot-worker | — | no test script |
| vairiot-mobile (Android) | not run | not run (outside npm workspaces; first run in S0.2) |
| vairiot-ios | not run | not run (S0.3) |

**Safety note:** bare `npm test` / `npm test --workspace=vairiot-api` runs the integration suite (including tenant-delete tests) against whatever `DATABASE_URL` is in `vairiot-api/.env`. Today that is local, but it was pointed at staging once (see `scripts/test-api.sh` header). Recommend making the API `test` script refuse to run unless the URL points at the test port, or routing it through `test-api.sh`. Proposed for S0.4.
