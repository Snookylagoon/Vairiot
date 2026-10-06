# Sprint 2 — IPSAS asset ledger and register import (weeks 7–10)

**Goal:** the register can hold TUDA's assets under IPSAS 45 / 21 / 26 rules, and TUDA's existing registers can be loaded through a controlled import. Feeds TOR Deliverables D2 and D4.

**Fit-gap items:** 3 (asset classes), 4 (recognition, depreciation), 5 (componentisation), 6 (impairment), 7 (donated assets), 10 (import).

**Branch:** `feature/s2-ipsas-ledger`

**Accounting note for Claude Code:** IPSAS 45 replaces IPSAS 17 for property, plant and equipment; IPSAS 21 covers impairment of non-cash-generating assets (the normal case for TUDA street infrastructure) and IPSAS 26 cash-generating assets. Implement the mechanics; the consultant's Accounting Policy Manual (D2) sets the actual thresholds and lives, which must all be configurable.

---

## Prompt S2.1 — Asset classes and accounting policies

```
Add an asset-class catalogue with IPSAS accounting policies that drive recognition, useful life and depreciation defaults.

Context:
- Path: /Volumes/DRSssd/Projects/GitHub/Vairiot-dev/vairiot-api
- Current: Category (hierarchical, name only); Asset has purchaseCost, cost components (freightCost, installationCost, customsDuties, otherCapitalizedCosts), residualValue, depreciationMethod (string, default straight_line), usefulLifeMonths, depreciationStartDate, capitalizationDate
- TUDA classes: traffic signal systems, road signs, passenger shelters, safety islands, information boards, traffic management equipment, office equipment, furniture, other

Steps:
1. Add AssetClass (tenantId, code, name, ipsasClass enum INFRASTRUCTURE | OPERATIONAL | OFFICE_EQUIPMENT | FURNITURE | VEHICLES | LAND | BUILDINGS | OTHER, capitalisationThreshold Decimal, defaultUsefulLifeMonths, defaultDepreciationMethod enum STRAIGHT_LINE | REDUCING_BALANCE | UNITS_OF_PRODUCTION | NONE, defaultResidualPct Decimal, componentisationRequired Boolean, glAssetAccount, glDepreciationAccount, glAccumulatedDepreciationAccount, glImpairmentAccount, active) with a migration and unique (tenantId, code).
2. Link Category.assetClassId (optional) and Asset.assetClassId (required for new assets after this sprint; backfill from category where set). Seed the nine TUDA classes with placeholder lives (signals 10 yrs, signs 7, shelters 15, islands 20, boards 7, traffic equipment 8, office equipment 5, furniture 10, other 5) marked "to be confirmed by D2".
3. Add Asset.acquisitionType enum PURCHASE | DONATION | TRANSFER_IN | CONSTRUCTION | FINANCE_LEASE | OTHER (default PURCHASE), Asset.fairValueAtRecognition Decimal?, Asset.sourceEntity String? (donor or transferring entity), Asset.recognitionDate DateTime?, Asset.capitalisedCost Decimal? computed = purchaseCost + cost components for PURCHASE, or fairValueAtRecognition for DONATION/TRANSFER_IN (store it; recompute in the service when inputs change).
4. Add a recognition check in asset.service.ts: when capitalisedCost is below the class threshold, set Asset.recognitionStatus = EXPENSED (new enum RECOGNISED | EXPENSED | PENDING_REVIEW) and exclude from depreciation, with an override flag and reason.
5. On asset create, default usefulLifeMonths, depreciationMethod and residualValue from the class when not supplied; expose the class on the asset forms in vairiot-web (NewAssetPage, EditAssetPage, AssetForm.tsx) and read-only on mobile.
6. Admin page vairiot-web/src/pages/admin/AssetClassesPage.tsx with GL account fields.
7. Update vairiot-shared constants and Zod, OpenAPI, Jest tests, and the import mapping in S0.6's profiler output format (classCode column).

Output:
- Migrations, seed, services, admin page, form changes, tests
- Files changed, with full paths

Think before answering (maximum reasoning).
```

**Acceptance:** creating a sign without a life gets 84 months from the class; a GEL 200 item under a GEL 500 threshold is marked EXPENSED.

---

## Prompt S2.2 — Componentisation

```
Add parent–component asset structures so a traffic signal installation can be held as controller, poles, heads and detectors with separate lives.

Context:
- Path: /Volumes/DRSssd/Projects/GitHub/Vairiot-dev/vairiot-api and vairiot-web
- Asset has no parent reference today; Category and Location already use parentId patterns
- IPSAS 45 requires significant parts with different useful lives to be depreciated separately

Steps:
1. Add Asset.parentAssetId String? (self-relation "AssetComponents"), Asset.componentRole String? (controller, pole, head, detector, cabinet, other), Asset.isComponent Boolean default false. Migration with index (tenantId, parentAssetId).
2. Rules in asset.service.ts: a component inherits site, location, position and custodian from its parent unless overridden; disposal or transfer of a parent prompts for its components; a parent's roll-up cost and net book value = own + components (computed, not stored); a component cannot have components (one level).
3. Add ComponentTemplate (tenantId, assetClassId, lines: role, defaultClassId, defaultLifeMonths, defaultCostSharePct) so creating a signal from a template creates the components in one transaction.
4. Web: on AssetDetailPage add a Components tab (list, add from template, add manually, move component to another parent); on the register list show a parent/component icon and a filter "roll-up".
5. Mobile: show components under the parent in AssetDetailScreen; allow tagging a component with its own RFID/QR (each component is a normal asset with its own GIAI).
6. Reports: fixed_asset_register.py and asset_valuation_summary.py gain a "roll-up" option that groups components under parents.
7. Tests for inheritance, roll-up and template creation.

Output:
- Migration, service rules, template model, web tab, mobile list, report option, tests
- Files changed, with full paths

Think before answering (maximum reasoning).
```

**Acceptance:** creating a "Signalised junction" from a template creates five assets; the parent's roll-up NBV equals the sum.

---

## Prompt S2.3 — Depreciation engine with locked periods

```
Build a monthly depreciation run with reducing-balance and units-of-production methods and locked accounting periods.

Context:
- Path: /Volumes/DRSssd/Projects/GitHub/Vairiot-dev/vairiot-api, vairiot-worker, vairiot-reports
- Current: straight-line only, computed on the fly in vairiot-reports/app/reports/assets/depreciation_schedule.py; no stored depreciation, no periods
- Worker: BullMQ queues in vairiot-worker/src/queues.ts and processors in src/processors

Steps:
1. Add AccountingPeriod (tenantId, year, month, status OPEN | CLOSED | LOCKED, closedBy, closedAt) and DepreciationEntry (tenantId, assetId, periodId, method, openingNbv, charge, closingNbv, accumulated, runId, reversedByRunId?) with migration and unique (assetId, periodId).
2. Add DepreciationRun (tenantId, periodId, status DRAFT | POSTED | REVERSED, assetCount, totalCharge, postedBy, postedAt, notes).
3. Implement depreciation.service.ts: for each recognised, non-disposed, non-expensed asset with depreciationStartDate ≤ period end: straight-line = (capitalisedCost − residual) / usefulLifeMonths; reducing balance = openingNbv × rate (rate stored on the asset or derived from life); units of production = (capitalisedCost − residual) × unitsThisPeriod / totalExpectedUnits (units from a new AssetUsage table); never below residual; components depreciate individually; impairment (S2.4) reduces the depreciable base from the impairment date.
4. Run as a BullMQ job (processor depreciation-run.ts) triggered from `POST /api/v1/accounting/periods/:id/depreciation/run`; DRAFT runs can be previewed and discarded; POSTED runs lock the period; reversal creates offsetting entries.
5. Add `GET /api/v1/accounting/periods`, period open/close/lock routes (Finance role only), and `GET /api/v1/assets/:id/depreciation` history.
6. Web: pages/accounting/PeriodsPage.tsx (period list, run preview with totals by class, post, reverse) and a Depreciation tab on AssetDetailPage.
7. Reports: rewrite depreciation_schedule.py to read DepreciationEntry when runs exist and fall back to projection otherwise; add depreciation_by_class.py.
8. Tests: each method, residual floor, locked period rejection, reversal, component behaviour.

Output:
- Migrations, service, worker processor, routes, pages, reports, tests
- Files changed, with full paths

Think before answering (maximum reasoning).
```

**Acceptance:** running October 2026 on seeded data posts entries; re-running a locked period is refused; the schedule report matches the posted entries.

---

## Prompt S2.4 — Impairment (IPSAS 21 / 26)

```
Add impairment records and the workflow from indicator to posting and reversal.

Context:
- Path: /Volumes/DRSssd/Projects/GitHub/Vairiot-dev
- Today: AssetEventType has IMPAIRED and REVALUED but nothing writes them; conditionGrade 1–2 from S1.5 is an impairment indicator; reconciliation classes include condition_variance
- IPSAS 21 (non-cash-generating): recoverable service amount = higher of fair value less costs to sell and value in use (depreciated replacement cost, restoration cost or service units approach)

Steps:
1. Add Impairment (tenantId, assetId, periodId, indicator enum CONDITION | DAMAGE | OBSOLESCENCE | IDLE | LEGAL | OTHER, indicatorNotes, carryingAmount, recoverableServiceAmount, method enum DRC | RESTORATION_COST | SERVICE_UNITS | FVLCS, impairmentLoss (computed = max(0, carrying − recoverable)), status DRAFT | APPROVED | POSTED | REVERSED, reversalOfId?, assessedBy, approvedBy, postedAt, evidence photo IDs) with migration.
2. Service: create from an asset, from a reconciliation item (S4) or automatically as DRAFT when conditionGrade drops to a grade with impairmentIndicator = true; posting writes an IMPAIRED event, reduces carrying amount, and the depreciation engine (S2.3) uses the new base; reversal is limited to the amount that would have been carried had no impairment occurred.
3. Routes under /api/v1/accounting/impairments with Finance approval (uses the approval framework if S3.1 is merged; otherwise a simple approvedBy field, to be refactored in S3.1).
4. Web: pages/accounting/ImpairmentsPage.tsx (queue of DRAFT indicators, assessment form with the four methods, approval, post) and an Impairment tab on AssetDetailPage.
5. Reports: impairment_register.py and an impairment line in asset_valuation_summary.py.
6. Tests: indicator creation from condition change, loss computation, depreciation after impairment, reversal cap.

Output:
- Migration, service, routes, pages, reports, tests
- Files changed, with full paths

Think before answering (maximum reasoning).
```

**Acceptance:** setting an asset to grade 1 creates a DRAFT impairment; posting it reduces NBV and the next depreciation run uses the reduced base.

---

## Prompt S2.5 — Excel import with mapping, staging and validation

```
Replace the CSV importer with a staged Excel/CSV import that maps columns, validates rows and keeps the legacy reference.

Context:
- Path: /Volumes/DRSssd/Projects/GitHub/Vairiot-dev/vairiot-api/src/services/import.service.ts (111 lines, CSV only) and vairiot-web/src/pages/import/ImportPage.tsx
- Profiler from S0.6 writes a suggested mapping JSON
- Secondary identifiers already exist: AssetSecondaryIdentifier with scheme FINANCE_REF and LEGACY_TAG
- Files up to 50,000 rows must import without timing out the request

Steps:
1. Add ImportBatch (tenantId, fileName, storageKey, status UPLOADED | MAPPED | VALIDATED | COMMITTED | CANCELLED, mapping Json, rowCount, errorCount, createdBy) and ImportRow (batchId, rowNumber, raw Json, mapped Json, status VALID | WARNING | ERROR | COMMITTED, messages Json, assetId?).
2. Upload: accept .xlsx, .xls, .csv up to 25 MB; store in MinIO; parse with exceljs/xlsx in a BullMQ job (import-parse.ts) into ImportRow.raw; detect header row and sheet.
3. Mapping: `PUT /imports/:id/mapping` accepts {targetField: sourceColumn} plus per-field transforms (date format, decimal separator, lookup tables for class/site/category/condition); support a saved mapping per tenant; accept the profiler's JSON as a starting point.
4. Validation job (import-validate.ts): required fields, duplicates within file and against the register (assetNumber, FINANCE_REF, serial), class and site lookups, numeric and date parsing, position range, capitalisation threshold → EXPENSED warning; write messages per row.
5. Commit job (import-commit.ts): create assets in batches of 500 inside transactions, write FINANCE_REF and LEGACY_TAG secondary identifiers, write MIGRATED events, skip ERROR rows, and support "update existing by FINANCE_REF" mode.
6. Web ImportPage: four-step wizard (upload → map → review errors with inline fix and re-validate → commit), progress from job status, download of the error rows as Excel.
7. Export the committed batch as an Excel reconciliation sheet (source row, created asset number, GIAI).
8. Tests with sample files in vairiot-api/src/__tests__/fixtures (clean, duplicates, bad dates, Georgian headers).

Output:
- Migrations, jobs, routes, wizard, fixtures, tests
- Files changed, with full paths

Think before answering (maximum reasoning).
```

**Acceptance:** a 10,000-row sample imports in under 2 minutes; rows with errors are excluded and downloadable; re-running the same file in update mode changes no asset numbers.

---

## Prompt S2.6 — Sprint close

```
Close sprint S2 on branch feature/s2-ipsas-ledger.

Steps:
1. Run `npm run lint` and `npm test`; fix failures.
2. Write docs/IPSAS-LEDGER.md for the consultant's D2 and D4: data model, every configurable policy field, the depreciation and impairment mechanics, the recognition rule, and worked examples with journal lines (Dr Depreciation expense / Cr Accumulated depreciation; Dr Impairment loss / Cr Accumulated impairment; donated asset Dr Asset / Cr Revenue from non-exchange transactions).
3. Update docs/known-fix-registry.md and write docs/sprints/S2-summary.md.
4. Open a pull request from feature/s2-ipsas-ledger to develop.

Output:
- docs/IPSAS-LEDGER.md, docs/sprints/S2-summary.md, pull request URL

Think before answering (maximum reasoning).
```

---

## Sprint checklist

- [ ] S2.1 Asset classes and policies
- [ ] S2.2 Componentisation
- [ ] S2.3 Depreciation engine and periods
- [ ] S2.4 Impairment
- [ ] S2.5 Excel import wizard
- [ ] S2.6 Sprint close and PR merged
