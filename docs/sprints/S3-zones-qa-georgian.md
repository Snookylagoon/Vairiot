# Sprint 3 — Zones, QA, approvals and Georgian UI (weeks 11–12)

**Goal:** the inventory can be organised into zones and teams with sampling and recounts, every sensitive change needs a second person, and the whole system reads in Georgian. Ends with the **tools freeze at ED+3**. Feeds TOR Deliverables D4 and D5.

**Fit-gap items:** 8, 9 (approvals and controls), 15 (zones, teams, routes), 19 (QA sampling, recounts), 22 (Georgian, part), 1–2 (tagging configuration, training tenant).

**Branch:** `feature/s3-operations`

---

## Prompt S3.1 — Maker–checker approval framework

```
Add a generic maker–checker approval framework and apply it to capitalisation, transfer, disposal, write-off and impairment.

Context:
- Path: /Volumes/DRSssd/Projects/GitHub/Vairiot-dev/vairiot-api
- Today: Disposal.approvedBy is free text; Transfer and AuditAdjustment (write_off, register_new) post immediately; RBAC exists (Role, UserRole, UserPermissionOverride, permissions.constants.ts); AuditEvent logs everything
- TOR D2 internal controls: acquisition and capitalisation, custody, transfers, periodic verification, disposal approvals, register maintenance

Steps:
1. Add ApprovalRequest (tenantId, entityType, entityId, action enum CAPITALISE | TRANSFER | DISPOSE | WRITE_OFF | IMPAIR | REGISTER_NEW | ADJUST_VALUE | ADJUST_LOCATION, payload Json, status PENDING | APPROVED | REJECTED | CANCELLED, requestedBy, decidedBy, decidedAt, reason, thresholdAmount) with migration; and ApprovalRule (tenantId, action, minAmount, approverRoleId, requireDifferentUser Boolean default true, active).
2. Service approval.service.ts: `request()` creates a PENDING record and leaves the entity in a PENDING_APPROVAL state; `decide()` enforces requireDifferentUser, applies the payload on approval (calls the existing disposal/transfer/adjustment services), writes AuditEvents for both steps, and emails the approver group via the worker (user-invite mailer pattern).
3. Wire the five actions: disposal.create, transfer.create, audit adjustments write_off and register_new, impairment post (S2.4), capitalisation when recognitionStatus changes EXPENSED → RECOGNISED. Below the rule's minAmount the action proceeds without approval but still logs.
4. Routes: `GET /approvals?status=`, `POST /approvals/:id/approve`, `POST /approvals/:id/reject`; OpenAPI.
5. Seed segregation-of-duties role templates for TUDA: Finance (approves capitalisation, impairment, disposal), Inventory Manager (approves transfers, register_new, write_off below threshold), Field Operator (requests only), Verifier (QA, S3.3), Viewer.
6. Web: pages/approvals/ApprovalsPage.tsx (inbox with filters, diff view of the payload, approve/reject with reason) and a bell badge in the header; the requesting pages show "Awaiting approval".
7. Tests: same-user rejection, threshold bypass, apply-on-approve for each action.

Output:
- Migrations, service, wiring, routes, seed roles, page, tests
- Files changed, with full paths

Think before answering (maximum reasoning).
```

**Acceptance:** a Field Operator's disposal request appears in Finance's inbox; the requester cannot approve their own request; approval creates the Disposal record.

---

## Prompt S3.2 — Inventory zones, teams, routes and progress

```
Add inventory zones with map boundaries, team assignment, route lists and a zone progress dashboard.

Context:
- Path: /Volumes/DRSssd/Projects/GitHub/Vairiot-dev
- Existing: Site and Location hierarchy; Location.boundary polygon added in S1.1; AuditCampaign with scope by site/location/category/asset list; AuditZoneSubmission (campaignId, locationId, submittedBy); MapPage from S1.4
- TOR D4: inventory zone mapping and team allocation plan

Steps:
1. Add InventoryTeam (tenantId, campaignId, name, leadUserId, members userIds[], deviceIds[]) and ZoneAssignment (campaignId, locationId, teamId, plannedStart, plannedEnd, status NOT_STARTED | IN_PROGRESS | SUBMITTED | VERIFIED | REOPENED, expectedCount, scannedCount, submittedAt, verifiedBy). Migration.
2. Zone drawing: on MapPage, in campaign set-up, draw or edit a zone polygon (MapLibre Draw) saved to Location.boundary; "assign assets by boundary" sets locationId on positioned assets inside the polygon (preview count first, approval-free but logged); import zones from GeoJSON (full GeoJSON exchange comes in S5.2).
3. Route list: for each zone, generate an ordered list of expected assets using a nearest-neighbour pass from the zone centroid (good enough for street walking); export as PDF (vairiot-reports, A4 portrait, QR of each asset number) and show on mobile.
4. Mobile: Field Operators see only their team's zones; AuditRunScreen shows zone progress (scanned / expected), the route list with "next asset", and a Submit zone action that requires the PhotoRule check from S1.3 (block submission when a hard rule fails; otherwise warn).
5. Web: campaign dashboard section "Zones" with a progress table and the map coloured by status; reopen a zone (Inventory Manager) with reason.
6. Worker: nightly job that emails the campaign owner a progress digest (zones by status, scans today, teams behind plan).
7. Tests: boundary assignment, route ordering determinism, submission rules.

Output:
- Migrations, zone drawing, route generator and PDF, mobile zone view, dashboard, digest job, tests
- Files changed, with full paths

Think before answering (maximum reasoning).
```

**Acceptance:** a drawn zone assigns positioned assets; a team's device shows only its zones; submitting a zone with a missing mandatory photo is blocked with a clear list.

---

## Prompt S3.3 — QA sampling, recounts and the Verifier role

```
Add statistical sampling, independent recounts and verifier sign-off to inventory campaigns.

Context:
- Path: /Volumes/DRSssd/Projects/GitHub/Vairiot-dev
- Existing: AuditCampaign.linkedCampaignId ("DoubleBlink" relation) for linked re-counts; ReconciliationClassification constants; AuditScanEvent.scannedBy and deviceId
- TOR Phase 4.4: sample testing, independent verification visits, recounts of selected locations, review of GPS and photos

Steps:
1. Add QaSample (tenantId, campaignId, zoneLocationId?, method RANDOM | STRATIFIED_BY_CLASS | HIGH_VALUE | RISK_BASED, sampleSizePct, seed, status DRAFT | IN_PROGRESS | COMPLETE) and QaSampleItem (sampleId, assetId, originalScanEventId?, verifierUserId?, result MATCH | NOT_FOUND | WRONG_LOCATION | WRONG_CONDITION | WRONG_POSITION | WRONG_TAG, verifierScanEventId?, notes, verifiedAt). Migration.
2. Service: generate a sample with a stored random seed so it is reproducible; stratified method allocates by asset class share; high-value picks the top N% by capitalisedCost; risk-based weights grade 1–2 condition, accuracy > 25 m and no-photo items.
3. Recount: "Create recount campaign" clones a zone's expected list into a linked campaign assigned to a different team; AuditComparisonPage already compares linked campaigns — extend it with variance rate per team and per zone (expected, scanned, verified, variance %).
4. Verifier role: can see sample lists, record results on mobile (a Verify mode in AuditRunScreen that scans and auto-sets MATCH or a mismatch reason), and mark a zone VERIFIED; cannot edit assets.
5. Reports: qa_sample_results.py (A4 landscape) and team_variance.py; both feed Deliverable D6.
6. Tests: reproducible sampling, stratification shares, variance maths.

Output:
- Migrations, sampling service, recount cloning, verifier mobile mode, comparison extension, reports, tests
- Files changed, with full paths

Think before answering (maximum reasoning).
```

**Acceptance:** a 5% stratified sample of a zone is reproducible with the same seed; a verifier's scan of a sampled asset records MATCH; team variance appears on AuditComparisonPage.

---

## Prompt S3.4 — Georgian language (web, Android, iOS, reports)

```
Add internationalisation with English and Georgian across the web console, both mobile apps and the reports service.

Context:
- Path: /Volumes/DRSssd/Projects/GitHub/Vairiot-dev
- No i18n exists today (grep for i18n, ka-GE returns nothing)
- Georgian uses the Mkhedruli script; Montserrat does not cover it — use Noto Sans Georgian as the fallback font in web and reports; Android and iOS system fonts cover Georgian
- Reports: Python/WeasyPrint (vairiot-reports) and the PDF route lists from S3.2

Steps:
1. Web: add react-i18next with namespaces per page; extract every user-visible string in vairiot-web/src into en/*.json; create ka/*.json with machine-translated placeholders marked with a leading "⟪MT⟫" so the professional translator can find them; language switch in the profile menu and per-tenant default (TUDA = ka); dates via Intl with ka-GE; numbers with GEL currency formatting where the tenant currency is GEL.
2. Android: move strings to res/values/strings.xml and res/values-ka/strings.xml; the Meferi devices must switch with the system locale or an in-app setting stored in DataStore.
3. iOS: Localizable.xcstrings with en and ka; in-app override stored in UserDefaults.
4. Reports: a `lang` query parameter on every report; a translations module in vairiot-reports/app with the same keys; Jinja templates use `t()`; embed Noto Sans Georgian in the WeasyPrint CSS; bilingual headers (English / Georgian) on D6–D8 reports by default.
5. Shared: condition labels, asset class names, reconciliation classifications and approval actions become translatable through a Translation table (tenantId, entity, entityId, lang, field, value) so TUDA can name its own classes in Georgian.
6. Add a script scripts/i18n-report.py that lists untranslated and ⟪MT⟫ keys per namespace for the translator.
7. Tests: a key-coverage test that fails when en and ka key sets differ; snapshot one report in ka.

Output:
- i18n set-up on four surfaces, extracted strings, translation table, translator script, tests
- Files changed, with full paths

Think before answering (maximum reasoning).
```

**Acceptance:** switching to Georgian changes every screen label on web and both apps; a report rendered with `lang=ka` shows Georgian text in Noto Sans Georgian; `python3 scripts/i18n-report.py` lists the ⟪MT⟫ keys.

---

## Prompt S3.5 — Tagging scheme configuration and the training tenant

```
Configure the TUDA identification scheme and build a training tenant with realistic data.

Context:
- Path: /Volumes/DRSssd/Projects/GitHub/Vairiot-dev
- Identification: TenantIdentification (INTERNAL or GS1 mode), TenantGs1Prefix, IdentifierBlock, LabelTemplate, label designer in vairiot-web/src/pages/labels, mobile LabelDesignScreen and PrinterService
- Hardware: on-metal UHF tags plus printed QR aluminium plates for street assets; UHF labels for office assets

Steps:
1. Add a tenant identification preset "TUDA": INTERNAL mode with asset number pattern `TUDA-{CLASS}-{SEQ:6}` (configurable), QR payload as GS1 Digital Link-style URL `https://{tenantDomain}/a/{assetNumber}`, UHF EPC encoded as GIAI-96 when a GS1 prefix is later licensed, else a 96-bit internal scheme with tenant ID and sequence.
2. Add two LabelTemplate presets: "Street plate 60×40 mm" (QR, asset number, class icon, TUDA wordmark) and "Office label 50×25 mm" (UHF label, barcode, asset number); add an "export plate batch" that writes a print-ready PDF (A4 sheets) and a CSV for an engraving supplier.
3. Dual-identification rule: street-class assets must have both an RFID tag binding and a QR plate secondary identifier before a zone can be submitted (reuses the PhotoRule mechanism, generalised to a ZoneSubmissionRule table).
4. Training tenant: a seed `seed:tuda-training` with 2,000 assets across the nine classes, positioned along real Tbilisi streets (generate points along a few named avenues within the city bounding box), three zones with boundaries, two teams, one in-progress campaign, sample photos, and a mix of conditions; a reset script that wipes and reseeds it.
5. Write docs/TRAINING-GUIDE.md: exercises for Field Operator, Verifier, Inventory Manager and Finance, each with the screens to use and the expected result, in English with a placeholder Georgian section.

Output:
- Identification preset, label presets and batch export, submission rules, training seed and reset, training guide
- Files changed, with full paths

Think before answering (maximum reasoning).
```

**Acceptance:** `npm run seed:tuda-training` populates the tenant and MapPage shows assets along Tbilisi streets; a plate batch PDF prints at the right physical size.

---

## Prompt S3.6 — Tools freeze: release, tag and sprint close

```
Close sprint S3, cut the pilot release and freeze the tools.

Steps:
1. Run every test suite (api, web, shared, worker, mobile unit tests, iOS build, Playwright smoke) and fix failures.
2. Bump versions to 2.0.0-pilot across the workspaces, build the Android APK and iOS ad-hoc IPA using the existing scripts (vairiot-mobile/scripts/upload-mobile-release.cjs, vairiot-ios/scripts/build-adhoc.sh), and publish them through the admin release channel pinned to the TUDA tenant only.
3. Deploy to staging with deploy.sh; run infra/restore-test.sh; run the training seed.
4. Tag `v2.0.0-pilot` on develop and open the PR to main.
5. Write docs/sprints/S3-summary.md and docs/RELEASE-NOTES-2.0.0-pilot.md (features by sprint, known limitations, upgrade steps), and a CHANGE-CONTROL.md stating that scope is frozen from this tag and changes go through written change orders.

Output:
- Release artefacts, tag, PR, release notes, change-control note

Think before answering (maximum reasoning).
```

---

## Sprint checklist

- [ ] S3.1 Maker–checker approvals
- [ ] S3.2 Zones, teams, routes, progress
- [ ] S3.3 QA sampling, recounts, Verifier
- [ ] S3.4 Georgian i18n
- [ ] S3.5 Tagging preset and training tenant
- [ ] S3.6 Tools freeze release v2.0.0-pilot
