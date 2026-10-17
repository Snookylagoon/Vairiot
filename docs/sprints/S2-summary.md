# Sprint S2 — IPSAS ledger and register import: summary

| Item     | Detail |
| -------- | ------ |
| Phase    | 2 (Sprint S2, decision D1) |
| Stages   | 2.0–2.17, 17 October 2026 |
| Versions | 2.7.0–2.13.1 |
| Record   | [Phase 2 record](../06-phase-2-record.md): exit gate, decisions, open points, acceptance |
| Deliverable | [IPSAS ledger mechanics](../IPSAS-LEDGER-MECHANICS.md) (TOR D2's mechanics) |

## Stages and commits

| Stage | Work | Commits |
| ----- | ---- | ------- |
| 2.0 | Phase 2 planned; D14–D21 approved | `604a69f` |
| 2.1 | Accounting permissions, decimal money, shared queue contracts, coverage gates | `4820826` `356087e` `2fbb6df` `fddf6e9` |
| 2.2 | Module registry, `ipsas` guard, module switches, toggle matrix; W1 released (2.7.0) | `c6e499b` `31565cb` `9ee24dd` `072c9d6` `52f6eed` `216e39f` |
| 2.3 | Asset classes, recognition and donations: API, seed, web | `abb5ff9` `5446da8` `ef83905` |
| 2.4 | The class on mobile, in the register report and the import; W2 released (2.8.0) | `fb01cfb` `28fe792` `1f3b0b3` `ded089f` |
| 2.5 | Components: structure, roll-up, templates | `566b2af` `956beed` |
| 2.6 | Components on the web, mobile and in the reports; W3 released (2.9.0) | `9063298` `3045132` `67dd58e` `b3b7fb0` |
| 2.7 | Custodian on assets, followed by their parts; on the apps | `2149af0` `0d08f47` `b37a481` |
| 2.8 | Depreciation engine, periods and runs | `6308430` `7d18028` |
| 2.9 | The register and reports from posted depreciation; the Periods page; depreciation by class (2.10.0) | `c5ed151` `0ef3008` `e418f81` |
| 2.10 | Depreciation runs in the worker; bulk usage | `b916bef` |
| 2.11 | Impairment and its reversal: API and engine | `458b242` |
| 2.12 | Impairment on the web; the impairment register; W5 released (2.11.0) | `302bcbf` `e4e5958` |
| 2.13 | Staged register import: API and worker; KFR-045 | `c7a3e71` `2a16ea9` |
| 2.14 | The import wizard; the old import removed; G33; W6 released (2.12.0) | `d254378` `b18fa26` |
| 2.15 | Row-level security on every tenant table | `e650b74` |
| 2.16 | Content-Security-Policy; MinIO unprivileged; W7 released (2.13.0) | `cf7da9f` `56b6f08` |
| 2.17 | Phase close: exit gate on the stack, gate scripts, Playwright ledger specs, this record (2.13.1) | this branch |

Each stage's detail is in the [stage log](../stage-log.md).

## What changed

### Foundations (stages 2.1–2.2)

- **Permissions:** `accounting:read`, `accounting:write` and `accounting:approve` (D16), given to TUDA's roles by the seed.
- **Money:** a decimal money helper (D14), used by every ledger calculation.
- **Queues:** queue names and job payloads are shared between the API and the worker.
- **Coverage gates:** set at the measured values for every package, raised as tests grow (D8).
- **Module registry:** the registry in `vairiot-shared` lists each module's API routes and screens. `requireFeature` answers 404 while a module is off, the platform console switches modules per tenant, and a toggle-matrix test walks the registry (D7).

### Classes and recognition (stages 2.3–2.4)

- **Classes:** asset classes with their IPSAS class, threshold, default life, method, residual value, componentisation and GL accounts; the nine TUDA classes are placeholders for D2. The Asset Classes page manages them.
- **Recognition:** the capitalised cost is tested against the class threshold, giving RECOGNISED, EXPENSED or PENDING_REVIEW, with Finance's override and reason.
- **Acquisitions:** donations and transfers in are recognised at fair value.
- **Where the class appears:** in the asset form and page, the Android and iOS apps (read-only), the register report and the import.

### Components and custodian (stages 2.5–2.7)

- **Parts:** an asset can be held as parts, one level deep (enforced by a trigger). The roll-up gives the group's cost, depreciation and carrying amount, and the threshold is tested on the group.
- **Templates:** component templates, including TUDA's Signalised junction, split the cost exactly.
- **Web:** the Components card on the asset page, markers and a roll-up filter in the asset list, and roll-up in the fixed asset register and valuation summary.
- **Apps:** an asset's parts, or its parent, on Android and iOS.
- **Disposal:** a parent's disposal disposes of or detaches its parts.
- **Custodian:** a custodian on every asset. It is set on the form, changed by transfers and recorded on the asset's history; parts take and follow their parent's.

### Depreciation (stages 2.8–2.10)

- **Engine:** straight line, reducing balance and units of production in decimals, with the D14 and D15 conventions, in `vairiot-shared`.
- **Periods and runs:** monthly periods, OPEN, CLOSED or LOCKED. Runs are prepared with a preview, posted by another approver and reversed with offsetting entries.
- **The worker:** the `depreciation-run` worker does each step. The Periods page shows its progress and why a step was not done.
- **Usage:** units for units of production, entered on the asset or in bulk.
- **Figures from the ledger:** the register, the asset page, the reports and the carrying amount at disposal come from posted entries; the asset page lists them month by month. A new depreciation-by-class report.

### Impairment (stages 2.11–2.12)

- **Records:** impairments under IPSAS 21 and 26 are raised by a grade that indicates impairment, or by hand, and assessed with four measurement methods. Another approver posts each one.
- **Reversal and correction:** a reversal of a loss is capped at the impairment outstanding and at the unimpaired carrying amount. A posting made in error is corrected by an offsetting record.
- **Effect on depreciation:** the engine depreciates the reduced base from the month an impairment is posted into, and the register is net of impairment.
- **Web:** the Impairment page, the asset's Impairment card, the impairment register report, and an impairment column in the valuation summary and in depreciation by class.

### Register import (stages 2.13–2.14)

- **Upload and steps:** .xlsx and .csv to MinIO. The `register-import` worker parses, validates and commits; the commit writes through the API's asset service at an internal endpoint.
- **Validation:** lookups, dates and numbers, positions, duplicates in the file and against the register, and the class threshold.
- **Corrections:** rows can be corrected and checked again. Error rows and a reconciliation sheet download as Excel.
- **Update mode:** matches by finance reference and changes no asset number.
- **Wizard:** four steps with mapping guesses in English, Georgian and Russian, and saved mappings. The old one-step import is removed.
- **G33:** the register export and the profiler carry the grade, the position's accuracy and source, the class, and the finance and legacy references.
- **Speed:** 10,000 rows in 45 s on the stack. That speed came from parallel writes, which exposed KFR-045, a race on a new tenant's identifier sequence, fixed in the database.

### Security (stages 2.15–2.16)

- **Row-level security** on every tenant table, and on each child table through its parent (G23). A coverage test and a cross-tenant route test keep it so.
- **Content-Security-Policy:** the web and admin consoles send one, with map tiles from an allow-list that the API enforces when tile settings are saved (G31).
- **MinIO** runs as uid 10001, and `deploy.sh` hands its data over once (G32).

### Phase close (stage 2.17)

- **Exit gate:** run on the Docker stack (record §2).
- **Gate scripts:** now in `scripts/gate/` with a README, so the gate can be repeated before a release.
- **Playwright:** the Periods page and the import wizard specs, on the mocked API.

## How to verify

```bash
npm run check
POSTGIS_IMAGE=imresamu/postgis:16-3.5-alpine ./scripts/test-api.sh
npm test --workspace vairiot-shared
npm test --workspace vairiot-worker
npx vitest run --root vairiot-web
npm run test:e2e --workspace vairiot-web
```

On the Docker stack: follow [scripts/gate/README.md](../../scripts/gate/README.md), which runs the Phase 1 and Phase 2 gates, the import budget and the browser test against the production images. The 10,000-row budget can also be timed against the test database with `IMPORT_BUDGET=1 ./scripts/test-api.sh import/import-budget`.

By hand in the console (TUDA, `ipsas` on): Administration → Asset Classes, Depreciation and Impairment; an asset's Components, Posted depreciation and Impairment cards; Import.

## What remains open

The open points carried into Phase 3 are in the record, §6:
- the PPE movement note and journal export, and revaluation;
- impairment raised from a reconciliation item;
- editing lookup tables and impairment evidence photos in the web console;
- S3.1's maker–checker framework;
- G28 and G34;
- the schema drift from before stage 1.4;
- the Phase 1 field checks P1.1 and P1.2, after the promotion.

## Files

Every file added, changed, moved or removed between the Phase 1 close (`0fc8130`) and this stage: 225 in all.

### vairiot-api (77)

- changed: `vairiot-api/jest.config.js`
- changed: `vairiot-api/package.json`
- added: `vairiot-api/prisma/migrations/20261016070000_accounting_permissions/migration.sql`
- added: `vairiot-api/prisma/migrations/20261016080000_asset_classes/migration.sql`
- added: `vairiot-api/prisma/migrations/20261016090000_asset_components/migration.sql`
- added: `vairiot-api/prisma/migrations/20261017010000_asset_custodian/migration.sql`
- added: `vairiot-api/prisma/migrations/20261017020000_depreciation_engine/migration.sql`
- added: `vairiot-api/prisma/migrations/20261017030000_depreciation_jobs/migration.sql`
- added: `vairiot-api/prisma/migrations/20261017040000_impairment/migration.sql`
- added: `vairiot-api/prisma/migrations/20261017050000_staged_import/migration.sql`
- added: `vairiot-api/prisma/migrations/20261017060000_identifier_sequence_race/migration.sql`
- added: `vairiot-api/prisma/migrations/20261017070000_row_level_security_all/migration.sql`
- changed: `vairiot-api/prisma/schema.prisma`
- changed: `vairiot-api/prisma/seed-tuda.ts`
- added: `vairiot-api/src/__tests__/accounting/accounting-permissions.test.ts`
- added: `vairiot-api/src/__tests__/accounting/asset-classes-wiring.test.ts`
- added: `vairiot-api/src/__tests__/accounting/asset-classes.test.ts`
- added: `vairiot-api/src/__tests__/accounting/components-views.test.ts`
- added: `vairiot-api/src/__tests__/accounting/components.test.ts`
- added: `vairiot-api/src/__tests__/accounting/impairment.test.ts`
- added: `vairiot-api/src/__tests__/accounting/ledger-overlay.test.ts`
- added: `vairiot-api/src/__tests__/accounting/money.test.ts`
- added: `vairiot-api/src/__tests__/accounting/periods.test.ts`
- changed: `vairiot-api/src/__tests__/assets/assets.test.ts`
- added: `vairiot-api/src/__tests__/assets/custodian.test.ts`
- changed: `vairiot-api/src/__tests__/gis/map-settings.test.ts`
- added: `vairiot-api/src/__tests__/gs1/identifier-sequence-race.test.ts`
- added: `vairiot-api/src/__tests__/helpers/staged-import.ts`
- added: `vairiot-api/src/__tests__/import/import-budget.test.ts`
- added: `vairiot-api/src/__tests__/import/openapi-contract.test.ts`
- added: `vairiot-api/src/__tests__/import/staged-import.test.ts`
- changed: `vairiot-api/src/__tests__/licensing/asset-cap.test.ts`
- added: `vairiot-api/src/__tests__/modules/toggle-matrix.test.ts`
- added: `vairiot-api/src/__tests__/security/cross-tenant-routes.test.ts`
- added: `vairiot-api/src/__tests__/security/csp-and-minio.test.ts`
- added: `vairiot-api/src/__tests__/security/row-level-security-coverage.test.ts`
- changed: `vairiot-api/src/__tests__/security/row-level-security.test.ts`
- changed: `vairiot-api/src/__tests__/tuda/seed-tuda.test.ts`
- changed: `vairiot-api/src/app.ts`
- changed: `vairiot-api/src/lib/api-spec.ts`
- changed: `vairiot-api/src/lib/feature-flags.ts`
- changed: `vairiot-api/src/lib/map-settings.ts`
- added: `vairiot-api/src/lib/money.ts`
- added: `vairiot-api/src/lib/openapi-accounting.ts`
- added: `vairiot-api/src/lib/openapi-import.ts`
- changed: `vairiot-api/src/lib/openapi.ts`
- changed: `vairiot-api/src/lib/queue.ts`
- changed: `vairiot-api/src/middleware/require-active-licence.ts`
- changed: `vairiot-api/src/middleware/require-feature.ts`
- added: `vairiot-api/src/routes/accounting/accounting.router.ts`
- added: `vairiot-api/src/routes/admin/tenant-modules.router.ts`
- changed: `vairiot-api/src/routes/assets/assets.router.ts`
- changed: `vairiot-api/src/routes/gis/gis.router.ts`
- added: `vairiot-api/src/routes/imports/imports.router.ts`
- changed: `vairiot-api/src/routes/reports/reports.router.ts`
- changed: `vairiot-api/src/services/asset-cap.service.ts`
- changed: `vairiot-api/src/services/asset-change-events.service.ts`
- added: `vairiot-api/src/services/asset-class.service.ts`
- changed: `vairiot-api/src/services/asset.service.ts`
- added: `vairiot-api/src/services/component-template.service.ts`
- added: `vairiot-api/src/services/component.service.ts`
- added: `vairiot-api/src/services/depreciation/ledger.ts`
- added: `vairiot-api/src/services/depreciation/projection.ts`
- added: `vairiot-api/src/services/depreciation/runs.service.ts`
- added: `vairiot-api/src/services/impairment.service.ts`
- removed: `vairiot-api/src/services/import.service.ts`
- added: `vairiot-api/src/services/import/batches.service.ts`
- added: `vairiot-api/src/services/import/commit.service.ts`
- added: `vairiot-api/src/services/recognition.service.ts`
- added: `vairiot-api/src/services/register-export.service.ts`
- changed: `vairiot-api/src/services/report-export.service.ts`
- changed: `vairiot-api/src/services/report.service.ts`
- added: `vairiot-api/src/services/reports/asset-valuation-summary.ts`
- added: `vairiot-api/src/services/reports/depreciation-by-class.ts`
- added: `vairiot-api/src/services/reports/impairment-register.ts`
- changed: `vairiot-api/src/services/tenant-features.service.ts`
- changed: `vairiot-api/src/services/transfer.service.ts`

### vairiot-shared (23)

- changed: `vairiot-shared/jest.config.cjs`
- changed: `vairiot-shared/package.json`
- added: `vairiot-shared/src/__tests__/accounting.test.ts`
- added: `vairiot-shared/src/__tests__/depreciation-golden.test.ts`
- added: `vairiot-shared/src/__tests__/import.test.ts`
- added: `vairiot-shared/src/__tests__/modules.test.ts`
- added: `vairiot-shared/src/constants/accounting.constants.ts`
- changed: `vairiot-shared/src/constants/asset.constants.ts`
- changed: `vairiot-shared/src/constants/permissions.constants.ts`
- changed: `vairiot-shared/src/constants/roles.constants.ts`
- added: `vairiot-shared/src/depreciation/engine.ts`
- added: `vairiot-shared/src/depreciation/index.ts`
- added: `vairiot-shared/src/depreciation/money.ts`
- added: `vairiot-shared/src/import/fields.ts`
- added: `vairiot-shared/src/import/index.ts`
- added: `vairiot-shared/src/import/parse.ts`
- changed: `vairiot-shared/src/index.ts`
- added: `vairiot-shared/src/modules/index.ts`
- added: `vairiot-shared/src/modules/module.registry.ts`
- added: `vairiot-shared/src/queues/index.ts`
- added: `vairiot-shared/src/queues/queue.contracts.ts`
- added: `vairiot-shared/src/schemas/accounting.schemas.ts`
- changed: `vairiot-shared/src/types/domain.types.ts`

### vairiot-worker (11)

- changed: `vairiot-worker/jest.config.js`
- changed: `vairiot-worker/package.json`
- added: `vairiot-worker/src/__tests__/depreciation-run.test.ts`
- added: `vairiot-worker/src/__tests__/register-import.test.ts`
- added: `vairiot-worker/src/depreciation/run-job.ts`
- added: `vairiot-worker/src/import/read-file.ts`
- added: `vairiot-worker/src/import/register-import.ts`
- changed: `vairiot-worker/src/index.ts`
- added: `vairiot-worker/src/processors/depreciation-run.ts`
- added: `vairiot-worker/src/processors/register-import.ts`
- changed: `vairiot-worker/src/queues.ts`

### vairiot-web (46)

- changed: `vairiot-web/Dockerfile`
- added: `vairiot-web/e2e/accounting.smoke.ts`
- changed: `vairiot-web/e2e/asset-map.smoke.ts`
- changed: `vairiot-web/e2e/asset-map.stack.ts`
- removed: `vairiot-web/nginx.conf`
- added: `vairiot-web/nginx.conf.template`
- changed: `vairiot-web/package.json`
- changed: `vairiot-web/src/App.tsx`
- added: `vairiot-web/src/__tests__/AssetClasses.test.tsx`
- added: `vairiot-web/src/__tests__/Components.test.tsx`
- added: `vairiot-web/src/__tests__/Depreciation.test.tsx`
- added: `vairiot-web/src/__tests__/Impairments.test.tsx`
- added: `vairiot-web/src/__tests__/Import.test.tsx`
- added: `vairiot-web/src/__tests__/moduleRoutes.test.ts`
- added: `vairiot-web/src/components/assets/AssetComponents.tsx`
- added: `vairiot-web/src/components/assets/AssetDepreciation.tsx`
- added: `vairiot-web/src/components/assets/AssetImpairments.tsx`
- added: `vairiot-web/src/components/assets/AssetRecognition.tsx`
- added: `vairiot-web/src/components/forms/AccountingFields.tsx`
- changed: `vairiot-web/src/components/forms/AssetForm.tsx`
- changed: `vairiot-web/src/components/layout/AppShell.tsx`
- changed: `vairiot-web/src/components/ui/Input.tsx`
- added: `vairiot-web/src/hooks/useAccounting.ts`
- changed: `vairiot-web/src/hooks/useAssets.ts`
- added: `vairiot-web/src/hooks/useImpairments.ts`
- changed: `vairiot-web/src/hooks/useImport.ts`
- added: `vairiot-web/src/lib/accounting.ts`
- changed: `vairiot-web/src/lib/schemas.ts`
- added: `vairiot-web/src/pages/accounting/AssetClassDialog.tsx`
- added: `vairiot-web/src/pages/accounting/AssetClassesPage.tsx`
- added: `vairiot-web/src/pages/accounting/ImpairmentsPage.tsx`
- added: `vairiot-web/src/pages/accounting/PeriodsPage.tsx`
- added: `vairiot-web/src/pages/accounting/UsageSection.tsx`
- changed: `vairiot-web/src/pages/admin/RoleMatrixDialog.tsx`
- changed: `vairiot-web/src/pages/admin/UserDetailPage.tsx`
- changed: `vairiot-web/src/pages/assets/AssetDetailPage.tsx`
- changed: `vairiot-web/src/pages/assets/AssetsPage.tsx`
- changed: `vairiot-web/src/pages/assets/EditAssetPage.tsx`
- changed: `vairiot-web/src/pages/assets/NewAssetPage.tsx`
- changed: `vairiot-web/src/pages/audits/AuditsPage.tsx`
- changed: `vairiot-web/src/pages/import/ImportPage.tsx`
- added: `vairiot-web/src/pages/import/MappingStep.tsx`
- added: `vairiot-web/src/pages/import/ReviewStep.tsx`
- changed: `vairiot-web/src/pages/reports/FixedAssetsPage.tsx`
- changed: `vairiot-web/src/stores/auth.store.ts`
- changed: `vairiot-web/vite.config.ts`

### vairiot-admin (12)

- changed: `vairiot-admin/Dockerfile`
- removed: `vairiot-admin/nginx.conf`
- added: `vairiot-admin/nginx.conf.template`
- changed: `vairiot-admin/package.json`
- added: `vairiot-admin/src/__tests__/TenantModulesCard.test.tsx`
- added: `vairiot-admin/src/components/tenants/TenantModulesCard.tsx`
- added: `vairiot-admin/src/hooks/useModules.ts`
- changed: `vairiot-admin/src/pages/tenants/TenantDetailPage.tsx`
- changed: `vairiot-admin/src/pages/users/RoleMatrixDialog.tsx`
- changed: `vairiot-admin/src/pages/users/UserDetailPage.tsx`
- added: `vairiot-admin/src/test-setup.ts`
- changed: `vairiot-admin/vite.config.ts`

### vairiot-reports (6)

- changed: `vairiot-reports/app/reports/__init__.py`
- changed: `vairiot-reports/app/reports/assets/asset_valuation_summary.py`
- added: `vairiot-reports/app/reports/assets/depreciation_by_class.py`
- changed: `vairiot-reports/app/reports/assets/fixed_asset_register.py`
- added: `vairiot-reports/app/reports/assets/impairment_register.py`
- changed: `vairiot-reports/pyproject.toml`

### vairiot-mobile (8)

- changed: `vairiot-mobile/app/build.gradle.kts`
- changed: `vairiot-mobile/app/src/main/java/com/vairiot/app/MainActivity.kt`
- changed: `vairiot-mobile/app/src/main/java/com/vairiot/app/data/FeatureFlags.kt`
- changed: `vairiot-mobile/app/src/main/java/com/vairiot/app/data/api/ApiModels.kt`
- added: `vairiot-mobile/app/src/main/java/com/vairiot/app/data/api/AssetRefModels.kt`
- changed: `vairiot-mobile/app/src/main/java/com/vairiot/app/ui/screens/AssetDetailScreen.kt`
- changed: `vairiot-mobile/app/src/main/java/com/vairiot/app/ui/screens/AssetDetailViewModel.kt`
- added: `vairiot-mobile/app/src/test/java/com/vairiot/app/data/AssetClassLabelTest.kt`

### vairiot-ios (7)

- changed: `vairiot-ios/VairiotMobile.xcodeproj/project.pbxproj`
- changed: `vairiot-ios/VairiotMobile/Data/FeatureFlags.swift`
- changed: `vairiot-ios/VairiotMobile/Models/Asset.swift`
- added: `vairiot-ios/VairiotMobile/Screens/Assets/AssetComponentsSection.swift`
- changed: `vairiot-ios/VairiotMobile/Screens/Assets/AssetDetailView.swift`
- added: `vairiot-ios/VairiotMobileTests/AssetClassLabelTests.swift`
- changed: `vairiot-ios/project.yml`

### infra (5)

- changed: `infra/deploy.sh`
- changed: `infra/docker-compose.prod.yml`
- changed: `infra/docker-compose.yml`
- changed: `infra/minio/Dockerfile`
- changed: `infra/restore.sh`

### scripts (11)

- added: `scripts/gate/README.md`
- added: `scripts/gate/gate.env.example`
- added: `scripts/gate/gate.override.yml`
- added: `scripts/gate/import_gate.py`
- added: `scripts/gate/phase1_gate.py`
- added: `scripts/gate/phase2_gate.py`
- added: `scripts/gate/requirements.txt`
- added: `scripts/gate/stack.sh`
- changed: `scripts/line-limit-baseline.txt`
- changed: `scripts/profile-register.py`
- changed: `scripts/tests/test_profile_register.py`

### docs (12)

- changed: `docs/02-data-model-and-module-registry.md`
- changed: `docs/05-phase-2-plan.md`
- added: `docs/06-phase-2-record.md`
- added: `docs/IPSAS-LEDGER-MECHANICS.md`
- changed: `docs/STAGING-SETUP.md`
- changed: `docs/known-fix-registry.md`
- added: `docs/sprints/S2-summary.md`
- changed: `docs/stage-log.md`
- changed: `docs/standard-adoption-plan.md`
- changed: `docs/testing/test-plan.md`
- added: `docs/word/build_phase2.py`
- added: `docs/word/~$iriot-AI-Phase-0-Hardening-and-Hosting.docx`

### .github (1)

- changed: `.github/workflows/ci.yml`

### (root) (6)

- changed: `.env.example`
- changed: `CHANGELOG.md`
- changed: `DEPLOY.md`
- changed: `package-lock.json`
- changed: `package.json`
- changed: `project.md`
