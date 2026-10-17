# Phase 2 — IPSAS Ledger and Register Import (Plan)

| Item                     | Detail                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase                    | 2 (Sprint S2, decision D1)                                                                                                                      |
| Status                   | In progress — W1 (2.7.0) and W2 (2.8.0) merged; W3 built (stages 2.5–2.7, 2.9.0); W4 (depreciation engine) next                            |
| Revision                 | 0.1 (16 October 2026)                                                                                                                           |
| Builds on                | Phase 1, accepted 16 October 2026 (stage 1.22, [record](04-phase-1-record.md)); version 2.6.1                                                   |
| Modules                  | `ipsas`: classes, policies, periods, depreciation, impairment. Import is core; its IPSAS columns need `ipsas`                                   |
| Prompts                  | [S2 sprint file](sprints/S2-ipsas-ledger-import.md) S2.1–S2.6, the detailed steps for each workstream                                           |
| Feeds                    | TOR Deliverables D2 (Accounting Policy Manual mechanics) and D4; fit-gap items 3, 4, 5, 6, 7, 10                                                |
| Exit gate (test plan §8) | [Test plan §8.3](testing/test-plan.md): S2.1–S2.5 gates, the S2 toggle gate and the golden-figure tests (§3.4), on the Docker stack behind nginx |

## 1. Workstreams

| #   | Workstream                               | Packages                                  | Content                                                                                                                                                                                                                                   | Release |
| --- | ---------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| W0  | Hand-over                                | docs                                      | Stage 2.0: this plan; data model document brought up to date (21 event types)                                                                                                                                                              | —       |
| W1  | Foundations                              | shared, api, web, worker, admin, reports  | `accounting:*` permissions (D16); `ipsas` guard on routes and screens; module registry in `vairiot-shared` with an admin toggle screen and the toggle-matrix test (adoption W5, D7); queue names and payloads shared; decimal money helper (D14); coverage gates (D8) | 2.7.0 — built, stages 2.1–2.2 |
| W2  | Asset classes, recognition, donations (S2.1) | api, shared, web, mobile, reports     | `AssetClass` with IPSAS policies and GL accounts; nine TUDA classes seeded "to be confirmed by D2"; class defaults on create; recognition status with threshold and override; acquisition type, fair value and source entity (fit-gap 7)  | 2.8.0 — built, stages 2.3–2.4 |
| W3  | Componentisation (S2.2)                  | api, web, mobile, reports                 | One-level parent and components; inheritance of site, location, position, custodian; roll-up cost and NBV computed; `ComponentTemplate`; Components tab; roll-up option in the register reports                                         | 2.9.0 — built, stages 2.5–2.7 |
| W4  | Depreciation engine and periods (S2.3)   | api, worker, web, reports                 | `AccountingPeriod`, `DepreciationRun`, `DepreciationEntry`; straight line, reducing balance, units of production; draft, post, reverse as worker jobs; locked periods; reports read posted entries                                      | 2.10.0  |
| W5  | Impairment (S2.4)                        | api, web, reports                         | `Impairment` IPSAS 21 / 26 with four measurement methods; draft from a grade with `impairmentIndicator`; post writes `IMPAIRED` and lowers the depreciable base; reversal capped; impairment register                                    | 2.11.0  |
| W6  | Staged import (S2.5)                     | api, worker, web, scripts                 | `ImportBatch`, `ImportRow`; .xlsx and .csv to MinIO; parse, validate and commit as jobs; mapping per tenant from the profiler's JSON; update mode by `FINANCE_REF`; error rows downloadable. G33: export and profiler gain position, grade and class columns | 2.12.0  |
| W7  | Security (adoption W4, second part)      | api, infra, web                           | Row-level security on the remaining tenant tables and every new one (G23), with a cross-tenant test over the routes; Content-Security-Policy that allows the tenant's tile host (G31); MinIO unprivileged (G32)                           | 2.13.0  |
| W8  | Phase close (S2.6)                       | all                                       | Exit gate on the Docker stack; `docs/IPSAS-LEDGER.md` with journal examples (D2, D4); `docs/06-phase-2-record.md`; S2 summary; Word report; owner acceptance; `phase-2-accepted`                                                           | 2.13.x  |

Each workstream lands as one or more stages (2.1, 2.2, …) merged on a green pipeline. `feat` stages bump the minor version and fixes the patch. W7 can run beside W2–W6: it touches migrations and infrastructure, not the ledger services.

## 2. Design

### 2.1 What exists today

| Area | Today | Consequence |
| ---- | ----- | ----------- |
| Money | Asset amounts and disposals are `Decimal(12,2)`. Arithmetic runs in JavaScript `Number`, rounded by `Math.round(x*100)/100` | Ledger arithmetic moves to `Prisma.Decimal` (D14) |
| Depreciation | `computeDepreciation()` in `asset.service.ts`: straight line only, on the fly, from `depreciationStartDate` to today; `depreciationMethod` is a free string and is ignored | Stays as the **projection** for assets with no posted entries; once a period is posted, carrying amounts come from the ledger |
| Ledger events | `IMPAIRED`, `REVALUED`, `DISPOSED` exist in `AssetEventType`, but nothing writes them; `asset_events` is append-only and hash-chained | W5 writes `IMPAIRED`; W2 makes disposal write `DISPOSED` |
| Import | `POST /assets/import` takes JSON rows parsed from CSV in the browser; synchronous; names, not codes; no Excel library | Replaced by the staged import (W6); the old route stays until the web wizard ships, then is removed |
| Worker | Six queues; the API copies a subset of the queue names and payload types by hand; no job-status pattern | Names and payloads move to `vairiot-shared` (W1); progress is read from the run and batch rows, not BullMQ job ids |
| Flags | `ipsas` is set for TUDA and read by no code | Every W2–W5 route answers 404 and every screen hides with `ipsas` off (W1) |
| Roles | No finance permissions; TUDA's Finance role only reads | `accounting:*` permissions (D16) |
| Line limits | `asset.service.ts` (569) and `report-export.service.ts` (1438) may only shrink | New logic goes in new files: `asset-class.service.ts`, `recognition.service.ts`, `component.service.ts`, `depreciation/*.ts`, `impairment.service.ts`, `import/*.ts` |
| Tenancy | RLS on `assets`, `audit_events`, `photos`; new tables are granted to `vairiot_rls` automatically | Every new tenant table carries `tenantId` (child tables too) and gets its policy in its own migration |

### 2.2 Ledger rules

- **Cost model only.** IPSAS 45 revaluation is out of scope (§5). `REVALUED` stays unused.
- **Carrying amount** = capitalised cost − accumulated depreciation − accumulated impairment, all from posted entries. Before the first posted run, it is the projection.
- **Depreciable base** = carrying amount − residual value at the start of the period. Charges never take the carrying amount below the residual value. An impairment changes the base from the period after it is posted.
- **Monthly periods** in the tenant's time zone (`Company.timezone`). The default convention is a full month's charge in the month of `depreciationStartDate` and none in the month of disposal (D15). Other conventions are class fields that the policy manual can set.
- **Rounding.** Each entry is rounded half-up to 2 decimals. The last month of an asset's life takes the remainder, so accumulated depreciation equals the depreciable base exactly (D14).
- **Immutability.** `DepreciationEntry` rows and posted `Impairment` rows are append-only by database trigger, as `asset_events` already are. A mistake is corrected by a reversing run or a reversal record, never by an update (D17).
- **Periods.** OPEN → CLOSED (no new runs, can be reopened by `accounting:approve`) → LOCKED (final). Posting a run closes its period. Runs on a locked period are refused.
- **Components** depreciate individually. A parent with components carries only its own cost, and the roll-up is computed.
- **Donated and transferred assets** are recognised at fair value on the recognition date. The journal is Dr Asset / Cr Revenue from non-exchange transactions (IPSAS 23), shown in `IPSAS-LEDGER.md`. Vairiot records the asset side and does not post the general ledger.
- **Journals are views, not postings.** Runs and impairments expose their journal lines (Dr Depreciation expense / Cr Accumulated depreciation, and so on) with the class's GL accounts, for export. Exporting to TUDA's general ledger is S5.

### 2.3 Workflow and approval

S3.1 brings the maker–checker framework. Until then (D17):

- A user with `accounting:write` prepares a run or an impairment.
- A different user with `accounting:approve` posts it.
- The service refuses a post by the user who prepared it, and records both users.
- S3.1 moves these steps onto approval requests without changing the ledger tables.

### 2.4 Import

- **Formats.** `.xlsx` and `.csv` up to 25 MB, parsed with `exceljs` (D18). `.xls` is refused with a message to save the file as `.xlsx`. The profiler keeps reading `.xls` for analysis.
- **Staging.** Upload, then parse, map, validate, review, commit. Each step is a worker job that updates `ImportBatch.status` and counts, and the web polls the batch.
- **Commit.** Rows are written in transactions of 500. Each creates the asset, its `FINANCE_REF` and `LEGACY_TAG` identifiers, and a `MIGRATED` event. The asset cap is checked once for the whole batch, before the first write (KFR-039).
- **Update mode.** Matches on `FINANCE_REF`, never changes asset numbers, and records each change on the ledger.
- **Validation.**
  - Columns: class code, site and category lookups, dates, decimals with either separator, the position range, and the condition string or grade.
  - Duplicates: within the file and against the register.
  - Threshold: an EXPENSED warning below the class threshold.
- **Contracts.** Request and response schemas for the import and ledger routes are Zod schemas in `vairiot-shared`, used by the API and the web (D19). OpenAPI stays hand-written, with a contract test for the new routes.

### 2.5 Changes to the sprint file

| Area | Sprint file | Change |
| ---- | ----------- | ------ |
| Branch | `feature/s2-ipsas-ledger`, one PR at the end | One branch per workstream, each merged into `dev` (as in Phase 1) |
| Money | `Decimal` fields, unspecified arithmetic | `Prisma.Decimal` throughout the ledger; half-up rounding; remainder in the last month (D14) |
| `Asset.assetClassId` | Required for new assets after the sprint | Required on create for tenants with `ipsas` on, enforced by the web form; the API takes the category's class and otherwise creates the asset as PENDING_REVIEW rather than refusing it, so the field apps, which do not choose classes, keep working (stage 2.3). Existing assets of `ipsas` tenants were marked PENDING_REVIEW (D20) |
| `capitalisedCost` | Stored, recomputed in the service | Stored and recomputed in the service on every write (ipsas on), with a database check that it is not negative; an EXPENSED asset shows no carrying amount in the projection and the reports (stage 2.3) |
| Approvals | Simple `approvedBy`, refactored in S3.1 | Preparer and approver must differ, enforced now (D17) |
| Units of production | `AssetUsage` table | Units entered per asset and period on the web; no device feed in S2 (D21) |
| Excel | `exceljs/xlsx`, .xls accepted | `exceljs`; .xls refused (D18) |
| Job status | Not specified | Run and batch rows carry status and counts; no BullMQ ids leave the API |
| Mobile | Class read-only; components under the parent | As specified. No accounting screens on mobile |
| Impairment trigger | From a grade change | From a grade with `impairmentIndicator` in the tenant's scale (stage 1.13), not a fixed grade |
| Components and the module | Not specified | Behind `ipsas`, like the classes they use: with it off, `parentAssetId` is ignored (stage 2.5) |
| `Asset.isComponent` | Stored Boolean | Not stored: an asset is a component when it has `parentAssetId`. One level is enforced by a database trigger, which also refuses a parent in another tenant (stage 2.5) |
| Recognition of components | Not specified | On the whole: the threshold is tested on the parent's roll-up cost and the components take the parent's status, so a junction whose cost is all in its parts is recognised (stage 2.5) |
| Inheritance | Site, location, position and custodian | Site, location, position and custodian, followed while the part still shares them with the parent; the category at creation only (stages 2.5–2.7). `Asset.custodian` added at stage 2.7: the accountable person or unit as text, as transfers name them |
| Template creation | One transaction | Each part through the normal asset create (numbers, GS1 reference, ledger event), not one database transaction; the template, its classes and the licence cap for the whole set are checked first (stage 2.5) |
| Parent disposal | "Prompts for its components" | `POST /assets/:id/dispose` refuses a parent with active parts (409 `COMPONENTS_ACTIVE`) unless `components` is `dispose` or `detach` (stage 2.5) |

## 3. Exit-gate tests

| Test | Pass condition |
| ---- | -------------- |
| `accounting/asset-class.test.ts` | A sign without a life gets 84 months from its class; a GEL 200 item under a GEL 500 threshold is EXPENSED and excluded from runs; the override is audited |
| `accounting/components.test.ts` | A "Signalised junction" template creates five assets in one transaction; the parent's roll-up NBV equals the sum; a component cannot have components |
| `accounting/depreciation-golden.test.ts` | Hand-worked figures for each method across a full life: residual floor, remainder in the last month, start and disposal month conventions, components |
| `accounting/periods.test.ts` | October 2026 on seeded data posts entries; a run on a locked period is refused; a reversal offsets exactly; the preparer cannot post |
| `accounting/impairment.test.ts` | A grade with `impairmentIndicator` creates a DRAFT; posting lowers the carrying amount; the next run uses the lower base; reversal is capped at the carrying amount without impairment |
| Reports | The depreciation schedule equals the posted entries; the movement totals equal the register NBV |
| `import/staged-import.test.ts` | Clean, duplicate, bad-date and Georgian-header fixtures; error rows excluded and downloadable; update mode changes no asset numbers |
| Import budget | 10,000 rows from upload to commit in under 2 minutes on the Docker stack (test plan §3.6) |
| S2 toggle matrix | With `ipsas` off every ledger route answers 404 and no ledger screen shows; on again, data unchanged |
| Tenancy (W7) | With RLS on every tenant table, a request in one tenant reads and writes nothing of another's, over every route |
| Playwright | Periods page: preview, post and reverse a run on the mocked API; import wizard to the review step |

## 4. Decisions

| #   | Decision | Recommendation | Status |
| --- | -------- | -------------- | ------ |
| D14 | Money arithmetic | `Prisma.Decimal` (decimal.js) for every ledger calculation, never `Number`; `Decimal(12,2)` per asset amount, `Decimal(16,2)` for run and report totals; half-up to 2 places per entry, the remainder in the last month of life | **Approved** |
| D15 | Depreciation period convention | Monthly in the tenant's time zone; a full month in the month of `depreciationStartDate`, none in the month of disposal; other conventions as class fields for the policy manual | **Approved** |
| D16 | Accounting permissions | `accounting:read`, `accounting:write` (prepare classes, runs, impairments, imports in update mode), `accounting:approve` (post, reverse, lock, override recognition). TUDA Finance gets all three; Administrator gets read and write; Inventory Manager gets read | **Approved** |
| D17 | Ledger integrity before S3.1 | Append-only entries corrected only by reversal; preparer and approver must be different users; no hash chain on the new tables (the asset ledger's chain records the asset side) | **Approved** |
| D18 | Spreadsheet library | `exceljs` (MIT, maintained, streams large files) in the API and worker; `.xls` refused; SheetJS not used (the npm package is no longer updated) | **Approved** |
| D19 | Contracts for the new routes | Zod schemas in `vairiot-shared` for the ledger and import routes, shared by API and web; OpenAPI still hand-written, with a contract test for these routes. Generating OpenAPI from Zod across the API stays a later decision | **Approved** |
| D20 | Asset class on existing and new assets | Required on create for tenants with `ipsas` on; back-fill from the category's class, else PENDING_REVIEW, listed on the classes page for Finance to resolve | **Approved** |
| D21 | Units of production input | Units entered per asset and period on the web (and in the import); no automatic feed in S2 | **Approved** |

## 5. Out of scope for Phase 2

- The revaluation model (IPSAS 45) and the `REVALUED` event; raise with D2 if TUDA's policy uses revaluation.
- Posting journals to TUDA's general ledger, and the IPSAS reporting pack: S5.
- The maker–checker approval framework and disposal approval: S3.1. Disposal keeps its current flow and gains the `DISPOSED` event.
- Accounting screens on mobile.
- Hash-chaining the new ledger tables (D17).
- Prettier across the codebase (G28): at a quiet point with no open branches.
- Field checks P1.1 and P1.2 from Phase 1 continue in parallel and are recorded when done.
