# Phase 2 — IPSAS Ledger and Register Import (Record)

| Item        | Detail |
| ----------- | ------ |
| Phase       | 2 (Sprint S2, decision D1) |
| Status      | **Accepted** by the owner on 17 October 2026 (stage 2.18); exit gate passed on the Docker stack the same day (§2) |
| Revision    | 0.1 (17 October 2026) |
| Version     | 2.13.1 (on `dev`; staging and production unchanged until promotion, §5) |
| Plan        | [Phase 2 plan](05-phase-2-plan.md) · [S2 sprint](sprints/S2-ipsas-ledger-import.md) |
| Summary     | [S2 summary](sprints/S2-summary.md): what changed, how to verify, open items, full file list |
| Deliverable | [IPSAS ledger mechanics](IPSAS-LEDGER-MECHANICS.md): the mechanics behind TOR Deliverable D2, the Accounting Policy Manual |
| Stages      | 2.0–2.17 ([stage log](stage-log.md)) |

## 1. Workstreams

| #   | Workstream | Stages | Release | Result |
| --- | ---------- | ------ | ------- | ------ |
| W1  | Foundations | 2.1–2.2 | 2.7.0 | Accounting permissions (D16), decimal money (D14), shared queue contracts, coverage gates (D8); the module registry with the `ipsas` guard, the platform toggle screen and the toggle matrix (D7) |
| W2  | Asset classes, recognition, donations (S2.1) | 2.3–2.4 | 2.8.0 | IPSAS classes with policies and GL accounts, the nine TUDA classes, recognition against the threshold with Finance's override, donations at fair value; the class on mobile, in the register report and the import |
| W3  | Componentisation (S2.2) | 2.5–2.7 | 2.9.0 | Assets held as parts, one level deep, with roll-up and group recognition; component templates (the Signalised junction); the Components card, roll-up in the register and reports; parts on Android and iOS; a custodian on every asset that parts inherit |
| W4  | Depreciation engine and periods (S2.3) | 2.8–2.10 | 2.10.0 | Straight line, reducing balance and units of production in decimals; monthly periods; runs prepared, posted by another approver and reversed, worked by the `depreciation-run` worker; the register and reports from posted entries; depreciation by class; bulk usage |
| W5  | Impairment (S2.4) | 2.11–2.12 | 2.11.0 | IPSAS 21 / 26 records raised by a grade or by hand, assessed with four measurement methods, posted by another approver, reversed with a cap, corrected by an offset; depreciation on the reduced base; the Impairment page, asset card and register |
| W6  | Staged import (S2.5) | 2.13–2.14 | 2.12.0 | .xlsx and .csv to MinIO, parsed, validated and committed by the `register-import` worker through the asset service; corrections and error rows; update mode by finance reference; the wizard; G33 export columns |
| W7  | Security (adoption W4, second part) | 2.15–2.16 | 2.13.0 | Row-level security on every tenant table (G23); the consoles' Content-Security-Policy (G31); MinIO unprivileged (G32) |
| —   | Phase close | 2.17 | 2.13.1 | Exit gate on the Docker stack, the gate scripts in the repository, the Playwright ledger specs, this record |

Every workstream was merged into `dev` on a green pipeline: #94 (W1), #95 (W2), #96 (W3), #97 (W4), #98 (W5), #99 (W6), #100 (W7).

## 2. Exit gate (test plan §8.3)

Run on 17 October 2026 against the production images with the standalone overlay, behind nginx with TLS, as a throwaway project on a fresh database seeded with `seed:tuda`, with the worker image doing every depreciation run and every import step. The scripts are now in the repository (`scripts/gate/`, with a README), so the gate can be repeated before a release. A second approver was invited as Finance through the API, as D17 requires.

### 2.1 Gate results

| Gate | Check on the stack | Result |
| ---- | ------------------ | ------ |
| Seed | The nine TUDA asset classes (BRD, FUR, ISL, OFF, OTH, SGN, SHL, SIG, TME) | **Pass** |
| S2.1 Classes | A sign created without a useful life takes 84 months from SGN and is RECOGNISED; a GEL 200 item under the GEL 500 threshold is EXPENSED | **Pass** |
| S2.2 Components | The "Signalised junction" template creates five assets (the junction and its controller, poles, signal heads and detectors); the roll-up NBV, 59,543.75, equals the parent's and parts' carrying amounts | **Pass** |
| S2.3 Depreciation | September and October 2026 runs are prepared by the worker and posted by the Finance user; the preparer's own post answers 403 (D17). October writes 5 entries: the sign and the junction's four parts, the junction itself left out as `no_cost` (its cost is all in its parts) and the 17 assets from the Phase 1 checks as not recognised | **Pass** |
| | A run on the locked October period is refused (409 `PERIOD_NOT_OPEN`) | **Pass** |
| | The depreciation schedule's accumulated depreciation equals the posted entries for every asset | **Pass** |
| S2.4 Impairment | Setting the sign to grade 1 raises a DRAFT with indicator CONDITION | **Pass** |
| | Assessed at a recoverable amount of 600.00 (IPSAS 21, depreciated replacement cost) and posted into November by the Finance user: the carrying amount goes from 976.20 to 600.00 (loss 376.20) | **Pass** |
| | The November run charges 7.32 on the sign: 600.00 over the 82 months left | **Pass** |
| S2.5 Import | 10,000 rows from upload to commit in **45.1 s** through nginx, the worker and the internal API (parse 2.7 s, validate 4.1 s, commit 38.3 s; budget 2 minutes) | **Pass** |
| | The two error rows (an unknown class with a bad date, a duplicate finance reference) are left out and download as a workbook with the reasons | **Pass** |
| | Each imported asset has its finance reference and a MIGRATED event; re-running ten rows in update mode changes their cost and no asset number | **Pass** |
| | Georgian and Russian headers are recognised: the wizard's first guess in the browser (Playwright) and `suggestImportMapping` (shared tests); the API's import tests cover clean, duplicate and bad-date files | **Pass** |
| Reports | The fixed asset register's NBV, 59,223.93 over 23 assets, equals the assets' own carrying amounts; the impairment register's net is 376.20. The PPE movement note is S5 (plan §5) | **Pass** |
| S2 toggle | With `ipsas` off, the settings, classes, periods, impairments and template routes answer 404 and `/auth/me` tells the console to hide the ledger; on again, every depreciation entry and impairment is unchanged | **Pass** |
| Tenancy (W7) | Every table with a `tenantId` on the deployed database has row-level security enabled and forced; the route-by-route test runs in CI (§2.2) | **Pass** |
| Phase 1 | The 15 Phase 1 checks still pass on the Phase 2 images | **Pass** |
| Browser | `asset-map.stack.ts`: signed in, the map draws every positioned asset and its tiles, the Content-Security-Policy is sent and nothing breaks it; the admin console signs in across origins with no violation | **Pass** |

### 2.2 Suites

| Suite | Result |
| ----- | ------ |
| API (Jest, PostGIS and Redis) | 523/523 in 63 suites at 72.9 % lines (the opt-in import budget test skipped; it is the S2.5 row above) |
| Golden figures (shared) | Each method over a full life, the residual floor, the last month's remainder, time zones, start and disposal months, impairment and its reversal cap: in shared 109/109 at 97.0 % lines |
| Worker | 24/24 at 37.9 % lines |
| Web (Vitest) | 80/80 at 19.5 % lines |
| Web browser (Playwright, API mocked) | 7/7, stable over three runs: the map (5), the Periods page preparing, posting and reversing a run, the import wizard to the review step |
| Web on the stack (Playwright) | 1/1 |
| Admin | 4/4 · Profiler 20/20 |
| Android · iOS | 85/85 · 69/69 (unchanged since stage 2.7; green in CI on #100) |
| `npm run check` | Line limits, British English, versions, ESLint, type-check: pass |

Coverage gates (D8, raised as measured, never lowered): API 50 → 72 % (65 set at stage 2.1), web 7 → 19 % and worker 10 → 37 % (both first set at stage 2.1), shared 95 %, admin 2 %.

### 2.3 Found during the phase

| Finding | Handling |
| ------- | -------- |
| **A new tenant's first GS1 references allocated at once failed** (KFR-045): the identifier sequence was created with `CREATE SEQUENCE IF NOT EXISTS`, which is not safe under concurrency. Found by the import's parallel commit; several mobile creates for a new tenant could have hit it | Fixed in the database (stage 2.13): the creation waits on the tenant's advisory lock; a test fails without the fix |
| **Sub-tenants would have been refused every new asset under the new row-level security**: the licence check and the asset cap read the parent's licence | Found by running the suite under the new policies (stage 2.15); both reads now cross tenants explicitly |
| A position in an import was silently dropped for an organisation without map positions | Validation warns (stage 2.14) |
| The import page polled every 1.5 s, close to the API's 100 requests a minute per address | Every 3 s (stage 2.14, found on the stack) |
| `exceljs` 4.4.0 brings an old `uuid`, rated moderate (a buffer check it does not use) | Recorded in the plan §2.5; CI fails on high and above, none present |

## 3. Field checks outstanding

| Check | From | Procedure |
| ----- | ---- | --------- |
| P1.1 An asset created outdoors keeps its position; offline scans sync with theirs | Phase 1, S1.2 | [manual-checks.md](testing/manual-checks.md) "Phase 1 field checks" |
| P1.2 Grade 2 on an audit scan prompts for a photo, which appears against the scan | Phase 1, S1.5 | Same |

Both need a staging or TUDA build with `gis` on. Staging still runs a build from before Phase 1 (§5), so they wait for the promotion.

## 4. Decisions

| #   | Decision | Status |
| --- | -------- | ------ |
| D14 | Decimal money, half-up per entry, the remainder in the last month | Applied (stages 2.1, 2.8); after an impairment the rest is spread over the remaining months (stage 2.11) |
| D15 | Monthly periods in the tenant's time zone; a full month in the start month, none from the disposal month | Applied (stage 2.8) |
| D16 | `accounting:read`, `accounting:write`, `accounting:approve` | Applied (stage 2.1); update-mode imports need `accounting:write` (stage 2.13) |
| D17 | Append-only entries corrected by reversal; preparer and approver differ; no hash chain on the new tables | Applied to runs (stage 2.8) and impairments (stage 2.11), by database checks and triggers; confirmed on the stack (§2.1) |
| D18 | `exceljs`; `.xls` refused | Applied (stage 2.13) |
| D19 | Zod contracts in `vairiot-shared`; hand-written OpenAPI with a contract test | Applied (stages 2.3–2.13); `import/openapi-contract.test.ts` |
| D20 | Class required on create with `ipsas` on; back-fill, else PENDING_REVIEW | Applied (stage 2.3), refined: the API creates a classless asset as PENDING_REVIEW, so the field apps keep working |
| D21 | Units entered per asset and period | Applied (stages 2.8–2.10): on the asset and in bulk |

The departures from the sprint file are in the plan's §2.5. The larger ones, each recorded at its stage:
- Depreciation runs are worker jobs that the API checks and queues (stage 2.10, at the owner's request).
- The import's commit runs in the worker and writes through the API's asset service via an internal endpoint (stage 2.13, the owner's choice). Rows are written four at a time rather than in transactions of 500.
- An impairment counts from the month it is posted into, to meet the gate's "the next run uses the reduced base".
- Impairment statuses are DRAFT, POSTED, REVERSED and DISMISSED, with no APPROVED step under D17. A reversal of a loss is kept apart from the correction of a posting.
- Template parts are created one by one through the normal asset create.

## 5. Release status

- `dev` carries 2.13.1.
- Staging (`test.vairiot.com`) runs a build from 14 October and production (`vai.vairiot.com`) the promotion of 15 October; both are before Phase 1 and on plain `postgres:16-alpine`.
- Promoting `dev` needs, in order:
  1. the PostGIS image switch, with a backup and restore test before it ([DEPLOY.md](../DEPLOY.md));
  2. DEPLOY.md's 2.6.0 security notes;
  3. MinIO's one-off hand-over to uid 10001, which `deploy.sh` does itself.
- `INTERNAL_API_TOKEN` is already set on both servers. `CSP_TILE_HOSTS` is needed only for a tenant's own tile server.
- Tags `phase-1-accepted`, `v2.7.0`–`v2.13.1` and, on acceptance, `phase-2-accepted` wait for that promotion.

## 6. Open points carried into Phase 3

| #   | Point | Proposed handling |
| --- | ----- | ----------------- |
| —   | The PPE movement note, journals to TUDA's general ledger, the IPSAS reporting pack | S5 (plan §5) |
| —   | Revaluation (IPSAS 45) | Raise with D2 if TUDA's policy uses it |
| —   | Impairment raised from a reconciliation item | S4 |
| —   | The import wizard does not edit lookup tables (the API takes them); impairment evidence photos are accepted by the API but not picked on the web | A later web stage |
| —   | The maker–checker framework (S3.1) to replace the simple preparer/approver rule | S3.1 |
| G28 | Prettier not applied across the codebase | One formatting commit at a quiet point |
| G34 | Login labels not tied to inputs | S3 accessibility (axe in Playwright) |
| —   | Schema drift predating stage 1.4 (`asset_events` index, `hash` default) | Still open: a migration at a quiet point |
| —   | The field checks P1.1 and P1.2 | After the promotion (§3) |

Closed in this phase: G23 (row-level security), G31 (Content-Security-Policy), G32 (MinIO as root), G33 (export and profiler columns).

## 7. Acceptance

| Item | Detail |
| ---- | ------ |
| Requested | 17 October 2026, with this record, the [S2 summary](sprints/S2-summary.md), the [IPSAS ledger mechanics](IPSAS-LEDGER-MECHANICS.md) and the Word report `docs/word/Vairiot-AI-Phase-2-IPSAS-Ledger-and-Import.docx` |
| Owner decision | **Accepted**, 17 October 2026: "I accept Phase 2. Record the acceptance and start the Phase 3 plan." |
| Follow-ups | The open points in §6; the Phase 1 field checks P1.1 and P1.2 after the promotion; tag `phase-2-accepted` at the promotion of `dev` to `main` |
| Next | [Phase 3 plan](07-phase-3-plan.md) (stage 3.0) |
