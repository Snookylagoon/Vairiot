# Sprint 4 — Pilot fixes, reconciliation engine and data quality (weeks 17–22)

**Goal:** fix what the pilot found, then reconcile the physical count against the accounting register and the GIS layer, with a data-quality view that drives corrective action. Feeds TOR Deliverable D6 and prepares D7.

**Fit-gap items:** 17 (duplicate and relocated classes, impairment flag), 18 (three-way reconciliation), 20 (data-quality dashboard), pilot defects.

**Branch:** `feature/s4-reconciliation`

**Change control:** the tools are frozen from v2.0.0-pilot. S4.1 covers defects. Anything in S4.2–S4.4 is already in the signed scope; anything else needs a change order before it is built.

---

## Prompt S4.1 — Pilot defect triage and fixes

```
Triage and fix the defects logged during the TUDA pilot.

Context:
- Path: /Volumes/DRSssd/Projects/GitHub/Vairiot-dev
- Defect log: docs/pilot/defect-log.xlsx (columns: ID, date, reporter, device, screen, steps, expected, actual, severity S1–S4, status) — if the file is missing, create the template and stop
- Release in the field: v2.0.0-pilot; fixes ship as 2.0.x patch releases through the admin release channel pinned to TUDA

Steps:
1. Read the defect log. Group defects by component and root cause; mark duplicates.
2. For S1 and S2 severities: reproduce with a test first, fix, keep the test. For S3: fix when the change is local to one file; otherwise list for the next patch. For S4: record only.
3. Treat any request that adds behaviour outside docs/CHANGE-CONTROL.md scope as a change request: add it to docs/pilot/change-requests.md with an effort estimate in days and leave the code alone.
4. Update docs/known-fix-registry.md for every fix.
5. Bump to 2.0.1, build and publish Android and iOS patch releases, deploy the API to staging then production using deploy.sh.
6. Write docs/pilot/defect-report.md: table of defects with status, root cause and fix commit, for Deliverable D5 (Pilot Inventory Assessment Report).

Output:
- Fixes with tests, updated defect log, change-request list, defect report, 2.0.1 release
- Files changed, with full paths

Think before answering (maximum reasoning).
```

**Acceptance:** every S1/S2 defect has a passing regression test and a commit hash in the defect report.

---

## Prompt S4.2 — Richer reconciliation classes and impairment flags

```
Extend the register reconciliation with duplicate and relocated classes and an impairment candidate flag.

Context:
- Path: /Volumes/DRSssd/Projects/GitHub/Vairiot-dev/vairiot-api/src/services/audit.service.ts and vairiot-shared/src/constants/audit.constants.ts
- Today: ReconciliationClassification = verified, misplaced, missing, surplus, condition_variance; AdjustmentType = update_location, update_condition, write_off, register_new, no_action; blind mode snapshots the register
- TOR Phase 5.3: identify unrecorded, missing, relocated, duplicate records, assets requiring impairment, assets for disposal or write-off

Steps:
1. Add classifications DUPLICATE (two register records resolve to one physical asset: same serial, same GIAI binding, or two snapshot rows scanned by one tag), RELOCATED (found at another site, as opposed to MISPLACED within a site), POSITION_VARIANCE (found more than a tenant-set distance — default 50 m — from the recorded position), TAG_MISMATCH (scanned tag bound to a different asset than the one visually identified), DISPOSAL_CANDIDATE (condition grade 1 or operator marks "not serviceable").
2. Add adjustment types MERGE_DUPLICATE (keeps one asset, moves history, photos and identifiers, soft-deletes the other, with approval), UPDATE_POSITION, REBIND_TAG, RAISE_IMPAIRMENT (creates a DRAFT Impairment from S2.4), RAISE_DISPOSAL (creates an approval request from S3.1).
3. Set AuditReconciliationItem.impairmentCandidate Boolean when found condition grade has impairmentIndicator = true, and distanceM Decimal for position variance.
4. Reconciliation runs as a BullMQ job for campaigns over 5,000 snapshot rows, with progress reporting.
5. Web AuditReconciliationPage: filters for the new classes, bulk actions by class (e.g. all POSITION_VARIANCE under 100 m → UPDATE_POSITION), a side-by-side duplicate merge view, and a map pin for each item.
6. Reports: reconciliation_detail.py and campaign_summary.py gain the new classes; add discrepancy_actions.py listing every adjustment with approval status.
7. Tests for each new classification with fixtures.

Output:
- Constants, service logic, job, page changes, reports, tests
- Files changed, with full paths

Think before answering (maximum reasoning).
```

**Acceptance:** two register rows with the same serial reconcile to one DUPLICATE item; merging them keeps the tag binding and photos on the surviving asset.

---

## Prompt S4.3 — Three-way reconciliation engine: physical v accounting v GIS

```
Build the three-way reconciliation between the physical count, TUDA's accounting fixed-asset register and the GIS layer.

Context:
- Path: /Volumes/DRSssd/Projects/GitHub/Vairiot-dev
- Inputs: (a) Vairiot register and campaign results after S4.2; (b) an accounting extract imported through the S2.5 wizard into a new ExternalRegisterRow table rather than into assets; (c) a GIS feature list imported as GeoJSON into ExternalGisFeature (full GeoJSON/Shapefile exchange is S5.2 — in this sprint read GeoJSON only)
- Match keys, in priority: FINANCE_REF secondary identifier, serial number, GIAI/legacy tag, class + location + fuzzy name, class + position within tolerance
- TOR Phase 5.2: reconcile with accounting records, fixed asset registers, GIS databases; Deliverable D7 reconciled asset database

Steps:
1. Add ReconciliationSet (tenantId, name, campaignId, accountingBatchId, gisBatchId, status, rules Json, counts Json) and ReconciliationMatch (setId, assetId?, externalRegisterRowId?, gisFeatureId?, matchKey, confidence 0–1, classification, variance Json, action, status OPEN | RESOLVED | DEFERRED, resolvedBy, notes).
2. Classifications: MATCHED_3WAY; IN_REGISTER_NOT_FOUND (accounting has it, no physical, no GIS); FOUND_NOT_IN_REGISTER (physical, not in accounting → candidate for recognition); GIS_ONLY; VALUE_VARIANCE (cost or NBV differ beyond tolerance); CLASS_VARIANCE; LOCATION_VARIANCE; POSITION_VARIANCE (GIS point v physical point beyond tolerance); QUANTITY_VARIANCE (accounting holds a lump sum line for N items — support one-to-many matching with an allocated cost per item).
3. Engine reconciliation-three-way.ts as a BullMQ job: deterministic pass per match key in priority order, each match consumes its rows; confidence from the key and the agreement of other fields; tolerances from the set's rules (value %, distance m, name similarity threshold using trigram or Levenshtein).
4. Resolution actions: link (create FINANCE_REF or gisFeatureId on the asset), recognise (create asset via approval REGISTER_NEW), derecognise (approval WRITE_OFF with reason), update class/location/value (approval ADJUST_*), defer with note. Every resolution writes an AssetEvent and, where money moves, an entry for the journal export (S5.1).
5. Routes under /api/v1/reconciliation/sets and /matches with pagination and filters; OpenAPI.
6. Web pages/reconciliation/ThreeWayPage.tsx: set-up wizard (choose campaign, accounting batch, GIS batch, tolerances), run with progress, results grid grouped by classification with counts and value totals, item view showing the three sources side by side with differences highlighted, bulk resolve.
7. Reports: three_way_summary.py (counts and values by classification, A4 landscape) and three_way_exceptions.py (every unresolved item) — these become part of D7.
8. Tests: fixtures with 50 assets, 48 accounting rows and 45 GIS features covering every classification; one-to-many lump-sum case.

Output:
- Migrations, engine job, routes, page, reports, fixtures, tests
- Files changed, with full paths

Think before answering (maximum reasoning).
```

**Acceptance:** the fixture set produces the expected count per classification; resolving a FOUND_NOT_IN_REGISTER item creates an approval request; the summary report totals equal the grid.

---

## Prompt S4.4 — Data-quality dashboard and rules

```
Add a rule-based data-quality dashboard that shows completeness, duplicates and classification errors and feeds corrective actions.

Context:
- Path: /Volumes/DRSssd/Projects/GitHub/Vairiot-dev
- Existing: ExceptionsPage and AlertSubscription (alert digests were never scheduled — confirm S0 fixed the producer); exception_summary.py
- TOR Phase 4.5: review inventory data for completeness, accuracy, consistency, duplications, missing records, classification errors

Steps:
1. Add DqRule (tenantId, code, name, severity INFO | WARNING | ERROR, scope ASSET | SCAN | CAMPAIGN, sql or predicate definition, active) seeded with: missing position; accuracy > 25 m; no photo at inventory; no condition grade; missing class; missing FINANCE_REF; duplicate serial; duplicate tag binding; duplicate position within 1 m for different assets; cost zero on recognised asset; life beyond class default × 2; position outside tenant bounding box; scan without zone; zone submitted with unresolved ERROR rules.
2. Add DqResult (ruleId, entityType, entityId, campaignId?, firstSeen, lastSeen, resolvedAt, resolvedBy) computed by a nightly job and on demand per campaign (dq-evaluate.ts), stored so trends can be charted.
3. Web pages/quality/DataQualityPage.tsx: score tiles (completeness %, accuracy %, consistency %), a rule table with counts and trend sparkline, drill-down list with "fix" shortcuts (open asset, open on map, open reconciliation item), export to Excel; per-team and per-zone breakdown for the field period.
4. Wire ERROR rules into zone submission (ZoneSubmissionRule from S3.5) and into campaign completion (campaign cannot complete with open ERROR results unless an Inventory Manager overrides with a reason).
5. Alerts: a DQ digest through AlertSubscription with frequency daily during campaigns.
6. Reports: data_quality_report.py for D6 periodic reports.
7. Tests: each seeded rule against fixtures; score maths.

Output:
- Migrations, rules seed, evaluation job, page, submission wiring, digest, report, tests
- Files changed, with full paths

Think before answering (maximum reasoning).
```

**Acceptance:** the dashboard shows a count for every seeded rule on the training tenant; a zone with an open ERROR cannot be submitted; the digest email arrives.

---

## Prompt S4.5 — Sprint close

```
Close sprint S4 on branch feature/s4-reconciliation.

Steps:
1. Run every test suite; fix failures.
2. Write docs/RECONCILIATION-METHOD.md for Deliverables D6/D7: match keys and priority, classifications with definitions, tolerances, resolution actions and their accounting effects, and how a reconciled database is exported.
3. Update docs/known-fix-registry.md and write docs/sprints/S4-summary.md.
4. Release 2.1.0 to staging and production; open the pull request to develop and then main.

Output:
- docs/RECONCILIATION-METHOD.md, docs/sprints/S4-summary.md, release, pull request URLs

Think before answering (maximum reasoning).
```

---

## Sprint checklist

- [ ] S4.1 Pilot defects fixed, 2.0.1 released
- [ ] S4.2 New reconciliation classes
- [ ] S4.3 Three-way engine
- [ ] S4.4 Data-quality dashboard
- [ ] S4.5 Sprint close, 2.1.0 released
