# Test Plan and Test Strategy

| Item                | Detail                                                                                                                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product             | Vairiot Asset Intelligence                                                                                                                                                                                     |
| Phase               | 0 — stage 0.9; extended at the start of every phase (S1–S5)                                                                                                                                                    |
| Owner               | Don Scott, VAIRIOT FZCO                                                                                                                                                                                        |
| Status              | Draft — what exists is measured from the repository; targets follow the standard §9 and decision D8                                                                                                            |
| Revision            | 0.1 (16 October 2026)                                                                                                                                                                                          |
| Date                | 16 October 2026                                                                                                                                                                                                |
| Companion documents | [Manual checks](manual-checks.md) · [00 Discovery and architecture](../00-discovery-and-architecture.md) · [02 Data model and module registry](../02-data-model-and-module-registry.md) · `docs/sprints/S1…S5` |

---

## 1. Objectives

1. Prove that field work captured offline is **never lost** and never duplicated.
2. Prove that one tenant can never see or change another tenant's data.
3. Prove that every module switches off cleanly, without losing data, and switches back on unchanged.
4. Prove that accounting results (depreciation, impairment, reconciliation, journals) are correct to the cent.
5. Prove that the TUDA deliverables in sprints S1–S5 meet their acceptance conditions on the real stack.
6. Keep production recoverable: backups restore, deploys stop safely.

## 2. Test levels

"Today" is the position on 16 October 2026. "Target" is the standard §9.1.

| Level         | Proves                                              | Today                                                                                           | Target and when                                                        |
| ------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Static        | Types, lint, format, file length, spelling, secrets | `tsc --noEmit` per workspace and ESLint in CI; Prettier by hand; Android lint in CI             | Husky pre-commit, line-limit and British English checks, Gitleaks (W3) |
| Unit          | One function, service or component                  | Jest (api, worker, shared), Vitest (web), JUnit 4 (Android), XCTest (iOS), `unittest` (scripts) | Every package, including admin (Vitest) and reports (pytest) (W5)      |
| Integration   | API against a real database and Redis               | API Jest suite with Supertest on throwaway Postgres 16 and Redis 7                              | Same, plus MinIO in the test stack                                     |
| Contract      | Responses match the OpenAPI                         | None (OpenAPI is hand-written)                                                                  | Raise as a decision with S2 import contracts                           |
| Component     | UI components with a mocked API                     | Vitest + Testing Library in web (6 files)                                                       | Web and admin, MSW for the API                                         |
| End to end    | Journeys in a browser or on a device                | None                                                                                            | Playwright smoke from S1.4; mobile flows from S3                       |
| Stack e2e     | Journeys on the Docker stack behind nginx           | `infra/restore-test.sh` only                                                                    | Playwright against a seeded stack before each release                  |
| Accessibility | WCAG 2.2 AA                                         | None                                                                                            | axe-core in Playwright (S3, with the Georgian UI)                      |
| Performance   | Throughput and time budgets                         | None                                                                                            | Import budget in S2; map budget in S1 (§3.6)                           |
| Security      | Dependencies, code, containers, running app         | Dependabot; `npm audit` by hand                                                                 | `npm audit --audit-level=high`, Semgrep, Trivy, Gitleaks in CI (W3)    |
| Manual        | Usability and field realism                         | [`manual-checks.md`](manual-checks.md): What / Steps / Pass / Fail on staging                   | Kept; extended per sprint                                              |

### 2.1 What exists per package

| Package           | Framework                 | Test files | Tests at S0 close | Runs in CI                   | Coverage gate       |
| ----------------- | ------------------------- | ---------- | ----------------- | ---------------------------- | ------------------- |
| `vairiot-api`     | Jest 30, Supertest        | 34         | 230               | Yes (`API Tests` job)        | 50 % lines (global) |
| `vairiot-web`     | Vitest 4, Testing Library | 6          | 12                | Yes                          | None                |
| `vairiot-shared`  | Jest 30                   | 3          | 42                | Yes                          | None                |
| `vairiot-worker`  | Jest 30                   | 1          | 5                 | Yes                          | None                |
| `vairiot-admin`   | —                         | 0          | 0                 | No (no `test` script)        | None                |
| `vairiot-reports` | —                         | 0          | 0                 | No                           | None                |
| `vairiot-mobile`  | JUnit 4                   | 9          | 62                | **No** (lint and build only) | None                |
| `vairiot-ios`     | XCTest                    | 6          | 41                | **No** (no iOS workflow)     | None                |
| `scripts/`        | Python `unittest`         | 1          | 17                | Yes (`Scripts` job)          | None                |

Counts of tests are from `docs/sprints/S0-summary.md` (6 October 2026); file counts are from 16 October 2026 and include the GIS work merged since.

## 3. Specialist suites

### 3.1 Module toggle matrix

| Module           | Off means                                                                                          | Suite                                                       | Status                         |
| ---------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------ |
| `blindAudit`     | Blind campaigns refused by the API; option hidden on web and Android                               | `audits/blind-audit.test.ts`                                | Exists (on and off not paired) |
| `gis`            | Position writes and `/assets/map` answer 404; web, Android and iOS hide GIS; stored positions kept | `assets/asset-gis-toggle.test.ts`; web `hasFeature.test.ts` | In progress (W1a)              |
| `ipsas`          | Ledger, periods and policies refused and hidden                                                    | `toggle-matrix.test.ts`                                     | Planned (S2, W5)               |
| `reconciliation` | Three-way engine refused and hidden                                                                | `toggle-matrix.test.ts`                                     | Planned (S4, W5)               |
| All              | Every module off, on and back off across API, web and mobile; flag changes written to `AuditEvent` | `toggle-matrix.test.ts`, web and mobile equivalents         | Planned (W5, D7)               |

### 3.2 Tenancy and access

| Check                                                                                                               | Suite                                                       | Status           |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------- |
| Tenant scope, client scope and licence middleware on the gated router                                               | `security/scope-middleware.test.ts`, `route-guards.test.ts` | Exists           |
| Role and permission checks                                                                                          | `rbac/rbac.test.ts`, `admin/users.test.ts`                  | Exists           |
| Tenant delete removes every table and file prefix                                                                   | `admin/tenant-delete.test.ts`                               | Exists           |
| **Cross-tenant fuzz**: every route and method called with another tenant's real ids returns 404 and changes nothing | `tenancy/cross-tenant-fuzz.test.ts`                         | Planned (W4, D5) |
| Row-level security: a query without `app.tenant_id` sees no rows                                                    | `tenancy/rls.test.ts`                                       | Planned (W4, D5) |
| Two-factor mandatory for Administrator and platform admin after grace                                               | `security/two-factor-policy.test.ts`                        | Planned (W4, D6) |
| Handover export contains only the tenant's data                                                                     | `handover/handover-leakage.test.ts`                         | Planned (S5.3)   |

Until W4 lands, **every new route needs a tenancy test** in its own suite: another tenant's id must give 404.

### 3.3 Offline and sync

| Check                                                                          | Suites                                                                                                | Status                                |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Failure never deletes a queued item; only a 4xx counts as an attempt           | Android `sync/QueueDrainerTest.kt`, `SyncFailureTest.kt`; iOS `QueueDrainerTests`, `SyncFailureTests` | Exists                                |
| Replays are idempotent (`clientRequestId`, 200 on replay before the cap check) | API `sync/sync-hardening.test.ts`, `assets/assets.test.ts`, `audits/audits.test.ts`                   | Exists                                |
| Blind-audit scans carry zone and condition                                     | Android `AuditScanRecorderTest.kt`; iOS `AuditScanRecorderTests`                                      | Exists                                |
| Offline photos survive and upload after their asset                            | Android `AssetAndPhotoQueueTest.kt`; iOS `AssetAndPhotoQueueTests`                                    | Exists                                |
| Delta sync keeps the cache until a sync completes                              | Android `AssetDeltaSyncTest.kt`; iOS `AssetDeltaSyncTests`; API `sync-hardening.test.ts`              | Exists                                |
| Rate limits and lockout hold across API replicas                               | API `sync/replicas.test.ts`                                                                           | Exists                                |
| GPS position stored in the queued row and replayed                             | Android `location/GpsCaptureTest.kt`; iOS `AssetPositionTests`                                        | Exists (assets); scans planned (S1.2) |
| Scan photo waits for its scan and resolves it by `clientRequestId`             | Mobile queue-ordering tests                                                                           | Planned (S1.3)                        |
| Room migrations from every shipped schema version                              | Android migration test                                                                                | Planned                               |
| In-place upgrade with queued work on a real device                             | Manual check on a Meferi and an iPhone                                                                | Before each mobile release            |

### 3.4 Accounting accuracy (IPSAS)

Golden-figure tests with hand-worked expected values: recognition threshold, straight-line and other methods, locked periods, component roll-up, impairment and reversal, donated assets, journal balance, movement note equal to register NBV. Today only `depreciation.test.ts` exists (asset-level depreciation). The rest is planned for S2 and S5.

### 3.5 Internationalisation

Every screen label in Georgian on web, Android and iOS; reports rendered with `lang=ka` in Noto Sans Georgian; missing-key report (`scripts/i18n-report.py`). Planned for S3 (D9).

### 3.6 Performance budgets

| Budget                                            | Source                      | Status                             |
| ------------------------------------------------- | --------------------------- | ---------------------------------- |
| 10,000-row register import in under 2 minutes     | S2.5 acceptance             | Planned                            |
| `/map` first render with seeded TUDA data ≤ 2.5 s | Proposed (standard example) | Planned (S1.4); confirm the number |
| Delta sync of 10,000 assets on a Meferi over 4G   | Proposed                    | Planned                            |

### 3.7 Recovery

`infra/restore-test.sh` restores the newest off-site backup into an isolated stack and checks migration status, every table's row count, every bucket's file count and the Redis snapshot. Run before each production release and at each sprint close.

## 4. Coverage thresholds

Decision D8: a **ratchet, never lowered**. A pull request may not lower a package's coverage. Branch thresholds are not yet decided; the standard's figures are shown as the end state.

| Package                                                            | Today        | End of S1              | End of S2 | End of S3 | End of S4 | Standard end state        |
| ------------------------------------------------------------------ | ------------ | ---------------------- | --------- | --------- | --------- | ------------------------- |
| `vairiot-api` (lines)                                              | 50 % (gate)  | 60 %                   | 70 %      | **80 %**  | 80 %      | 80 % lines, 70 % branches |
| API core (auth, tenancy, audit, flags)                             | Not measured | —                      | —         | —         | 90 %      | 90 % lines, 85 % branches |
| `vairiot-web`, `vairiot-admin`, `vairiot-shared`, `vairiot-worker` | No gate      | Gate at measured value | **60 %**  | 60 %+     | **80 %**  | 80 % / 70 %               |
| `vairiot-reports`                                                  | No tests     | First tests (W5)       | **60 %**  | 60 %+     | **80 %**  | 80 % / 70 %               |
| Android, iOS (view models and sync)                                | Not measured | Measured in CI (W3)    | **60 %**  | 60 %+     | **80 %**  | 80 % / 70 %               |

The API steps between 50 % and 80 % are a proposed even ratchet across S1–S3; D8 fixes only the start and end.

## 5. Test data

| Data set                | Contents                                                                    | Where                                     |
| ----------------------- | --------------------------------------------------------------------------- | ----------------------------------------- |
| Per-test fixtures       | Each API test upserts the tenant, licence and users it needs                | `vairiot-api/src/__tests__`               |
| Demo seed               | Demo tenants for development                                                | `npm run db:seed --workspace=vairiot-api` |
| TUDA tenant             | Standalone, GEL, Asia/Tbilisi, `gis`/`ipsas`/`reconciliation` on, six roles | `npm run seed:tuda` (S0.6)                |
| TUDA training tenant    | Assets along Tbilisi streets                                                | `seed:tuda-training` (planned, S3.5)      |
| Register sample         | Synthetic Excel register with planted problems                              | `scripts/samples/register-sample.xlsx`    |
| Reconciliation fixtures | Expected count per classification                                           | Planned (S4.3)                            |

Rules: synthetic data only; credentials generated per environment and never committed. `docs/Demo Passwords.xlsx` breaks this rule and is open point G7 (D4 deferred).

## 6. Environments

| Environment | What runs there                                                                                                                                                            | Data                           | Who uses it                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------- |
| Local unit  | `npm test --workspace=…`, `./gradlew testDebugUnitTest`, `xcodebuild … test`, `python3 -m unittest discover -s scripts/tests`                                              | In memory                      | Developer                                                                                         |
| Local API   | `npm run test:api` → `scripts/test-api.sh`: `infra/docker-compose.test.yml` (Postgres 16 in tmpfs on 55432, Redis 7 on 56379), migrations, Jest, teardown                  | Throwaway, destroyed on exit   | Developer, before every push                                                                      |
| CI          | GitHub Actions on `main` and `dev`: lint and type-check, unit tests (worker, shared, web), API tests on service containers, Docker builds, scripts, Android lint and build | Throwaway                      | Every push and pull request                                                                       |
| Staging     | `test.vairiot.com`, `testadmin.vairiot.com` (`docker-compose.prod.yml` + `staging-shared`); deployed with `scripts/deploy-dev.sh`                                          | Its own database; test tenants | Manual checks, acceptance, restore test, mobile staging builds                                    |
| Standalone  | `docker-compose.standalone.yml` for TUDA's own server                                                                                                                      | TUDA                           | TUDA acceptance, after install                                                                    |
| Production  | `vai.vairiot.com`, `vaiadmin.vairiot.com`                                                                                                                                  | Customers                      | **Smoke only**: `/health/ready`, sign-in as a synthetic tenant, one read. No test data is written |

The API suite **refuses to run** against any database that is not a local `*_test` database (S0.4). Never point it at staging or production.

## 7. CI pipeline

| Job today                   | Content                                                                             | Change planned (W3)                                                             |
| --------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Lint & Type-check           | `npm ci`, build shared, ESLint, `tsc --noEmit` ×5, unit tests (worker, shared, web) | Add line-limit, British English, version check; admin tests                     |
| API Tests                   | Postgres and Redis services, `prisma migrate deploy`, Jest with coverage            | Upload JUnit and coverage artefacts                                             |
| Docker (matrix)             | Build each image; push to GHCR on `main`                                            | Trivy scan                                                                      |
| Scripts (Python)            | `unittest` for the register profiler                                                | Add `vairiot-reports` pytest                                                    |
| Android (separate workflow) | Lint, `assembleDebug`                                                               | Add `testDebugUnitTest`                                                         |
| —                           | —                                                                                   | New: `security` job (npm audit high, Semgrep, Gitleaks); iOS build and test job |

All jobs: `permissions: contents: read`, actions pinned by SHA, a timeout on each job (W3).

## 8. Exit gates per sprint

Each sprint closes only when every gate passes **on the real stack** and the evidence is in the sprint record. Gates come from the **Acceptance** lines of each prompt in `docs/sprints/S*.md`. Every gate also requires: `npm run lint` clean, every unit suite green, `npm run test:api` green, Android and iOS unit tests green, coverage at or above the ratchet in §4.

### 8.1 Phase 0 (S0, stages 0.1–0.9)

S0 gates were met on 6 October 2026 (`S0-summary.md`, "How to verify"). Stage 0.9 adds: `gis` toggle test on and off with data kept (W1a); one version (`2.0.0`) across every manifest; the documentation set present; the Word edition built by `python3 docs/word/build_phase0.py`.

### 8.2 Phase 1 — S1 GIS, condition and photos

| Gate                 | Pass condition                                                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1.1 Location model  | Migrations apply to a fresh database; API suite passes; `/api/v1/assets/geo?bbox=44.7,41.6,44.9,41.8` returns GeoJSON                                                         |
| S1.2 Mobile GPS      | An asset created outdoors on a Meferi stores a position with accuracy; audit scans write positions to `AuditScanEvent` after sync                                             |
| S1.3 Scan photos     | A photo taken during an audit appears against that scan on the web with time and position; the stored file has no EXIF GPS                                                    |
| S1.4 Map             | `/map` shows seeded TUDA assets as clustered markers; choosing a campaign recolours markers; dragging a marker updates the asset and writes an event; Playwright smoke passes |
| S1.5 Condition scale | Existing assets show a grade after migration; grade 2 on mobile prompts for a photo; the condition report groups by grade                                                     |
| S1 toggle            | With `gis` off, every S1 GIS route answers 404 and no GIS UI shows; with it on again, data is unchanged                                                                       |

### 8.3 Phase 2 — S2 IPSAS ledger and import

| Gate              | Pass condition                                                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| S2.1 Classes      | A sign without a life gets 84 months from its class; a GEL 200 item under a GEL 500 threshold is EXPENSED                     |
| S2.2 Components   | A "Signalised junction" template creates five assets; the parent's roll-up NBV equals the sum                                 |
| S2.3 Depreciation | October 2026 run on seeded data posts entries; re-running a locked period is refused; the schedule report matches the entries |
| S2.4 Impairment   | Grade 1 creates a DRAFT impairment; posting it reduces NBV; the next run uses the reduced base                                |
| S2.5 Import       | 10,000 rows in under 2 minutes; error rows excluded and downloadable; re-running in update mode changes no asset numbers      |
| S2 toggle         | With `ipsas` off, ledger routes answer 404 and screens are hidden                                                             |

### 8.4 Phase 3 — S3 zones, QA, approvals, Georgian

| Gate                 | Pass condition                                                                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S3.1 Maker–checker   | A Field Operator's disposal request reaches Finance's inbox; the requester cannot approve it; approval creates the `Disposal`                                           |
| S3.2 Zones and teams | A drawn zone assigns positioned assets; a team's device shows only its zones; a zone missing a mandatory photo cannot be submitted, with a clear list                   |
| S3.3 QA sampling     | A 5 % stratified sample is reproducible with the same seed; a verifier's scan records MATCH; team variance shows on the comparison page                                 |
| S3.4 Georgian        | Switching to Georgian changes every label on web and both apps; a `lang=ka` report shows Noto Sans Georgian; `scripts/i18n-report.py` lists the machine-translated keys |
| S3.5 Training tenant | `seed:tuda-training` populates the tenant and the map shows assets along Tbilisi streets; a plate batch PDF prints at the right size                                    |
| S3.6 Tools freeze    | Every suite green; restore test passes on staging; release published to the TUDA tenant only                                                                            |

### 8.5 Phase 4 — S4 reconciliation and data quality

| Gate                  | Pass condition                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| S4.1 Pilot defects    | Every S1/S2 defect has a passing regression test and a commit hash in the defect report                                                        |
| S4.2 Classes          | Two register rows with one serial reconcile to one DUPLICATE item; merging keeps the tag binding and photos                                    |
| S4.3 Three-way engine | The fixture set gives the expected count per class; resolving FOUND_NOT_IN_REGISTER creates an approval request; summary totals equal the grid |
| S4.4 Data quality     | The dashboard counts every seeded rule on the training tenant; a zone with an open ERROR cannot be submitted; the digest e-mail arrives        |
| S4 toggle             | With `reconciliation` off, engine routes answer 404 and screens are hidden                                                                     |

### 8.6 Phase 5 — S5 reporting and handover

| Gate                | Pass condition                                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| S5.1 Reporting pack | `pytest vairiot-reports` passes; the movement note's closing NBV equals the register NBV on the same date; the journal export balances |
| S5.2 GIS exchange   | An exported Shapefile opens in QGIS with correct positions; re-importing it links every feature to its asset                           |
| S5.3 Handover       | The pack restores into a clean PostgreSQL with `pg_restore`; counts match the manifest; the cross-tenant check finds no leakage        |
| S5.4 Final release  | Every suite, the restore test and a handover export on staging pass                                                                    |

## 9. Defects

| Severity | Meaning                               | Release rule                     |
| -------- | ------------------------------------- | -------------------------------- |
| Sev1     | Data loss or a security breach        | Blocks release                   |
| Sev2     | A feature unusable                    | Blocks release                   |
| Sev3     | A feature impaired, workaround exists | Only with the owner's acceptance |
| Sev4     | Cosmetic                              | Does not block                   |

The standard names these S1–S4. Here they are **Sev1–Sev4**, because S1–S5 are already sprint ids (the same reason as D2; decision D10, approved 16 October 2026). Every fix carries a test that fails before and passes after, and non-trivial lessons go into `docs/known-fix-registry.md`. A flaky test is a defect: record it, find the cause (as KFR-017 and KFR-025 did), fix it, never retry silently.

## 10. Traceability matrix

`REQ-xx` is the TUDA fit-gap item number used in the sprint files (items 1–22). Pull requests reference the `REQ-xx` they serve. Suites marked **planned** do not exist yet.

| REQ    | Requirement (fit-gap item)                       | Sprint     | Module                | Suites                                                                                                                                                                                    |
| ------ | ------------------------------------------------ | ---------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-01 | Tagging scheme configuration                     | S3.5       | core (identification) | `gs1/gs1.test.ts`, shared `gs1.test.ts`, Android `Gs1Test.kt`; tagging preset (planned)                                                                                                   |
| REQ-02 | Training tenant                                  | S3.5       | core                  | `tuda/seed-tuda.test.ts`; `seed-tuda-training.test.ts` (planned)                                                                                                                          |
| REQ-03 | Asset classes and accounting policies            | S2.1       | `ipsas`               | `ipsas/asset-classes.test.ts` (planned)                                                                                                                                                   |
| REQ-04 | Recognition and depreciation                     | S2.1, S2.3 | `ipsas`               | `depreciation.test.ts`; `ipsas/depreciation-run.test.ts` (planned)                                                                                                                        |
| REQ-05 | Componentisation                                 | S2.2       | `ipsas`               | `ipsas/components.test.ts` (planned)                                                                                                                                                      |
| REQ-06 | Impairment (IPSAS 21 / 26)                       | S2.4       | `ipsas`               | `ipsas/impairment.test.ts` (planned)                                                                                                                                                      |
| REQ-07 | Donated assets                                   | S2         | `ipsas`               | `ipsas/donated-assets.test.ts` (planned)                                                                                                                                                  |
| REQ-08 | Maker–checker approvals                          | S3.1       | core (approvals)      | `approvals/maker-checker.test.ts` (planned)                                                                                                                                               |
| REQ-09 | Internal controls                                | S3.1       | core (approvals)      | `approvals/controls.test.ts` (planned)                                                                                                                                                    |
| REQ-10 | Register profiling and import                    | S0.6, S2.5 | core (import)         | `scripts/tests/test_profile_register.py`; `import/import-wizard.test.ts`, import performance (planned)                                                                                    |
| REQ-11 | GPS and GIS positions                            | S1.1, S1.2 | `gis`                 | `assets/asset-geo.test.ts`, `asset-gis-toggle.test.ts`, shared `geo.test.ts`, web `GeoPosition.test.tsx`, Android `GpsCaptureTest.kt`, iOS `AssetPositionTests`; scan positions (planned) |
| REQ-12 | Map view; GeoJSON and Shapefile exchange         | S1.4, S5.2 | `gis`                 | web `AssetMap.test.tsx`; Playwright map smoke, `gis/exchange.test.ts` (planned)                                                                                                           |
| REQ-13 | Photos bound to scans                            | S1.3       | core (media)          | `photos/photos.test.ts`, `image-metadata.test.ts`, `download-strip.test.ts`, mobile photo queue tests; scan photos and `PhotoRule` (planned)                                              |
| REQ-14 | Condition assessment scale                       | S1.5       | core (register)       | `assets/condition-scale.test.ts`, mobile selector tests (planned)                                                                                                                         |
| REQ-15 | Zones, teams and routes                          | S3.2       | `blindAudit`          | `audits/blind-audit.test.ts`; `audits/zones-teams.test.ts` (planned)                                                                                                                      |
| REQ-16 | Offline capture and sync                         | S0.2–S0.4  | core (sync)           | `sync/sync-hardening.test.ts`, `sync/replicas.test.ts`, `audits/audits.test.ts`, Android and iOS sync suites (§3.3)                                                                       |
| REQ-17 | Duplicate and relocated classes; impairment flag | S4.2       | `reconciliation`      | `audits/blind-audit.test.ts` (existing classes); `reconciliation/classes.test.ts` (planned)                                                                                               |
| REQ-18 | Three-way reconciliation                         | S4.3       | `reconciliation`      | `reconciliation/three-way.test.ts` with fixtures (planned)                                                                                                                                |
| REQ-19 | QA sampling and recounts                         | S3.3       | `blindAudit`          | `audits/qa-sampling.test.ts` (planned)                                                                                                                                                    |
| REQ-20 | Data-quality dashboard                           | S4.4       | `reconciliation`      | `data-quality/rules.test.ts`, web dashboard tests (planned)                                                                                                                               |
| REQ-21 | IPSAS reports and journal export                 | S5.1       | `ipsas`, reports      | `vairiot-reports` pytest (planned)                                                                                                                                                        |
| REQ-22 | Georgian language; handover pack                 | S3.4, S5.3 | core (i18n, handover) | i18n key and render tests, `handover/handover-leakage.test.ts` (planned)                                                                                                                  |

Cross-cutting suites that serve every requirement: tenancy (§3.2), toggle matrix (§3.1), recovery (§3.7).

Two items are split by assumption, because the sprint files group them: items 1–2 ("tagging configuration, training tenant") and 8–9 ("approvals and controls"). Confirm against the fit-gap plan.
