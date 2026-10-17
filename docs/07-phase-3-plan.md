# Phase 3 — Zones, QA, Approvals and Georgian (Plan)

| Item                     | Detail |
| ------------------------ | ------ |
| Phase                    | 3 (Sprint S3, decision D1) |
| Status                   | **Approved** 17 October 2026: decisions D22–D31 approved as recommended (§4); W0 from stage 3.1 |
| Revision                 | 0.1 (17 October 2026) |
| Builds on                | Phase 2, accepted 17 October 2026 (stage 2.18, [record](06-phase-2-record.md)); version 2.13.1 |
| Modules                  | Approvals, teams, QA sampling and the Georgian language are core. Zone drawing and boundary assignment need `gis`; approvals of capitalisation and impairment need `ipsas` |
| Prompts                  | [S3 sprint file](sprints/S3-zones-qa-georgian.md) S3.1–S3.6, the detailed steps for each workstream |
| Feeds                    | TOR Deliverables D4 (zone mapping and team allocation) and D5; D2's internal controls; fit-gap items 1–2, 8, 9, 15, 19, 22 (part) |
| Ends with                | The **tools freeze** at ED+3: the pilot release, tagged `pilot-tuda`, after which scope changes go through written change orders |
| Exit gate (test plan §8) | [Test plan §8.4](testing/test-plan.md): S3.1–S3.6, on the Docker stack behind nginx with `scripts/gate/`, and on staging for the release |

## 1. Workstreams

| #   | Workstream | Packages | Content | Release |
| --- | ---------- | -------- | ------- | ------- |
| W0  | Hand-over and staging | docs, infra | Stage 3.0: this plan. Then staging promoted to `dev`: the PostGIS image switch with a backup and restore test first; MinIO's hand-over; the Phase 1 field checks P1.1 and P1.2 on a staging build (D30) | 2.13.x |
| W1  | Maker–checker approvals (S3.1) | shared, api, worker, web, mobile | `ApprovalRequest`, `ApprovalRule`; capitalisation, transfer, disposal, write-off, register-new and impairment through requests; thresholds; the approvals inbox and badge; "awaiting approval" on the requesting screens and the apps; emails to approvers (D22) | 2.14.0 |
| W2  | Zones, teams, routes (S3.2) | api, web, mobile, worker, reports | Zone boundaries on locations (D23) drawn on the map (D24) or imported from GeoJSON; assignment by boundary; `InventoryTeam`, `ZoneAssignment`; route lists with a PDF (D25); the apps show a team's zones and the next asset; zone submission rules; the zones dashboard; the nightly progress digest | 2.15.0 |
| W3  | QA sampling, recounts, Verifier (S3.3) | shared, api, web, mobile, reports | `QaSample`, `QaSampleItem`; reproducible random, stratified, high-value and risk-based samples (D26); recount campaigns for another team; variance per team and zone on the comparison page; the Verifier's verify mode on both apps; the QA results and team variance reports | 2.16.0 |
| W4  | Georgian: web (S3.4, part 1) | web, shared | `react-i18next` with namespaces per area (D27); every user-visible string of the web console in `en` and `ka`; machine-translated Georgian marked ⟪MT⟫ for the translator (D29); the language switch and the tenant's default; dates, numbers and GEL by locale; Noto Sans Georgian | 2.17.0 |
| W5  | Georgian: apps, reports, tenant data (S3.4, part 2) | mobile, ios, reports, api, scripts | Android string resources with `values-ka` and an in-app choice; an iOS string catalogue (`Localizable.xcstrings`) with an in-app choice; `lang` on every report with Georgian headers in Noto Sans Georgian; a `Translation` table for the tenant's own class, category and condition names (D28); `scripts/i18n-report.py`; key-coverage tests | 2.18.0 |
| W6  | Tagging preset, labels, training tenant (S3.5) | api, web, reports, scripts, docs | The TUDA identification preset (D31); the street plate and office label templates; plate batch PDF and the engraver's CSV; the dual-identification rule for street assets; `seed:tuda-training` with 2,000 assets along Tbilisi streets and its reset; `docs/TRAINING-GUIDE.md` | 2.19.0 |
| W7  | Carry-overs | web, api, docs | G34 (login labels tied to inputs) with axe checks in Playwright; the schema drift from before stage 1.4 (`asset_events` index, `hash` default); the import wizard's lookup tables and impairment evidence photos on the web; G28 Prettier at a quiet point between workstreams | patch releases |
| W8  | Tools freeze (S3.6) | all | Every suite green; the exit gate on the stack; mobile builds published to TUDA only (D30); staging deployed with the restore test and the training seed; production promoted on the owner's go-ahead; tags `v…` and `pilot-tuda`; S3 summary, Phase 3 record, CHANGE-CONTROL.md, Word report | pilot release |

Each workstream lands as one or more stages (3.1, 3.2, …), merged into `dev` on a green pipeline (merged without asking once every check passes, per the owner's standing instruction). `feat` stages bump the minor version and fixes the patch. W4 and W5 are the largest; W5's apps part can run beside W2–W3, which change other screens.

## 2. Design

### 2.1 What exists today

| Area | Today | Consequence |
| ---- | ----- | ----------- |
| Approvals | `Disposal.approvedBy` and `Transfer.approvedBy` are free text; transfers, disposals and audit adjustments (write-off, register-new) take effect at once. Depreciation runs and impairments already need a different approver (D17, Phase 2) | S3.1's requests sit in front of the first group; runs and impairments keep their own post step and also appear in the inbox (D22) |
| Roles | TUDA's seed has Administrator, Finance, Inventory Manager, Field Operator, Verifier, Viewer | S3.1 step 5 is mostly there: approval rules and the Verifier's permissions are added |
| Zones | `Location` has no boundary: Phase 1 positioned assets (`assets.geom`) but not locations. `AuditZoneSubmission` records a zone's submission by `locationId`; campaigns are scoped by site, location, category or asset list | A boundary column on locations (D23); zones stay locations, so campaign scope and submissions keep working |
| Map | Leaflet (D12) with clustering, the campaign layer and pick-on-map; no drawing | A drawing plugin (D24) |
| Photo rules | `PhotoRule` per category (minimum photos at inventory); a grade with `photoRequired` | Generalised to zone submission rules (S3.2, S3.5) |
| Linked campaigns | `AuditCampaign.linkedCampaignId` ("DoubleBlink") and `AuditComparisonPage` compare two campaigns | Recounts reuse them; variance per team and zone is added |
| Languages | No internationalisation anywhere. Web: about 1,000 strings in 97 files. Android: one string resource; about 400 strings in 30 Compose screens. iOS: about 250 strings in 31 SwiftUI views (`Text` literals are localisable as they are). Reports: 43 definitions in ReportLab | The largest workstream (W4, W5). The platform console (`vairiot-admin`) stays English: it is for Vairiot's staff (D27) |
| Reports | ReportLab with a column and summary definition per report, not WeasyPrint and Jinja as the sprint file says | Georgian through a registered Noto Sans Georgian TTF and a translations module (§2.5) |
| Identification | `TenantIdentification` (INTERNAL or GS1), GS1 prefixes, identifier blocks, RFID tags and bindings, label templates and the designer. Asset numbers are `AST-` and six digits | The TUDA preset adds a pattern for new assets (D31) |
| Releases | Android and iOS releases are per environment, not per tenant | A tenant scope on releases for "TUDA only" (D30) |
| Environments | Staging and production run builds from 14 and 15 October, before Phase 1, on plain Postgres | W0 promotes staging first; production only at the freeze (D30) |

### 2.2 Approvals (S3.1)

- **Requests.** `ApprovalRequest` holds the action, the entity, the payload of the change, the requester and the decision. The change itself is applied only when the request is approved, by the existing services: disposal, transfer, adjustment, recognition override. Until then:
  - the asset shows "awaiting approval" through its open request, with no new asset status, so the apps need no status change;
  - a second request for the same action on the same asset is refused.
- **Rules.** `ApprovalRule` per action gives the minimum amount (the asset's carrying amount, or its capitalised cost for capitalisation) and the approver role.
  - Below the amount, the action proceeds at once and is logged.
  - The requester can never approve their own request for disposal, write-off and impairment, whatever the rule says. For the other actions, `requireDifferentUser` defaults to true.
- **Actions.**

  | Action | Requested by | Approved by (TUDA default) |
  | ------ | ------------ | -------------------------- |
  | Capitalisation (EXPENSED → RECOGNISED by override) | `accounting:write` | Finance |
  | Disposal | `asset:write` | Finance |
  | Impairment (posting) | `accounting:write` | Finance (its existing post step) |
  | Transfer | `asset:write`, mobile included | Inventory Manager |
  | Register-new (an audit adjustment) | `audit:write` | Inventory Manager |
  | Write-off (an audit adjustment) | `audit:write` | Inventory Manager below the threshold, Finance above |

- **Runs and impairments.** These already have a prepare and post step with a different approver (D17). They appear in the same inbox rather than gaining a second approval.
- **Notifications.** The worker emails the approver role, using the invitation mailer's pattern and the mail settings the tenant already has. The web header shows a badge with the open count.
- **Audit.** Both the request and the decision are audit events, and the decision's reason is required for a rejection.

### 2.3 Zones, teams and routes (S3.2)

- **Zones** are locations with a boundary: `locations.boundary geometry(MultiPolygon, 4326)` with a GiST index (D23).
  - They are drawn or edited on the map in campaign set-up (D24), or imported from a GeoJSON file of polygons.
  - **Assign by boundary** sets `locationId` (and the site) on the positioned assets inside the polygon. It shows a preview count first, logs each change on the asset's ledger, and needs `gis`.
- **Teams.** `InventoryTeam` per campaign holds a lead, members and devices. `ZoneAssignment` gives a zone to a team, with planned dates and a status: NOT_STARTED, IN_PROGRESS, SUBMITTED, VERIFIED or REOPENED. The expected and scanned counts come from the campaign.
- **Routes.** The expected assets of a zone are ordered by a nearest-neighbour walk from the zone's centroid, with ties broken by asset number, so the order is reproducible (D25). They are shown on the apps with "next asset" and exported as an A4 PDF with each asset's QR.
- **Apps.** A Field Operator's device lists only the team's zones and shows the zone's progress. **Submit zone** checks the zone submission rules:
  - photo minimums, and grades needing a photo (S1.3);
  - from W6, dual identification for street assets.

  A hard rule blocks the submission with the list of assets to fix; a soft rule warns.
- **Dashboard.** A Zones section on the campaign shows the progress table and the map coloured by status. An Inventory Manager can reopen a zone with a reason.
- **Digest.** A nightly worker job emails the campaign owner the zones by status, today's scans and the teams behind plan.

### 2.4 QA sampling and recounts (S3.3)

- **Samples.** `QaSample` (method, percentage, seed, status) and `QaSampleItem` (asset, verifier, result).
  - The seed is stored, and the draw is a seeded shuffle of the zone's asset ids in a fixed order, so the same seed gives the same sample (D26).
  - **Stratified:** allocates by each asset class's share, with largest-remainder rounding.
  - **High value:** takes the top share by capitalised cost.
  - **Risk-based:** weights grades 1–2, positions less accurate than 25 m, and assets without a photo.
- **Verification.** The Verifier's verify mode on both apps scans a sampled asset and records MATCH, or the mismatch: not found, wrong location, wrong condition, wrong position or wrong tag. The Verifier can mark a zone VERIFIED but cannot edit assets.
- **Recounts.** A recount clones a zone's expected list into a linked campaign for a different team. The comparison page adds expected, scanned, verified and variance % per team and per zone.
- **Reports.** QA sample results (A4 landscape) and team variance, which feed Deliverable D6.

### 2.5 Georgian (S3.4)

- **Web.** `react-i18next` with one namespace per area (assets, audits, accounting, imports, settings, common) and English as the source (D27).
  - Georgian keys hold a machine translation marked with a leading ⟪MT⟫ until the professional translator replaces it (D29).
  - The language comes from the user's choice, else the tenant's default (TUDA: `ka`).
  - Dates use `Intl` with `ka-GE`, and amounts are shown in the tenant's currency.
  - Montserrat has no Mkhedruli, so Noto Sans Georgian (SIL OFL) is the fallback font, self-hosted (the CSP allows fonts from self and Google Fonts).
- **Android.** Strings move to `res/values/strings.xml` with `values-ka`. The app follows the system language, or the choice made in its settings (per-app language, stored in DataStore).
- **iOS.** A string catalogue (`Localizable.xcstrings`) with `en` and `ka`, and an in-app choice stored in UserDefaults. The CI project check is regenerated with the catalogue.
- **Reports.** A `lang` parameter on every export; the API passes the user's language. The reports service has a translations module keyed like the web's, and registers Noto Sans Georgian for ReportLab. D6–D8 reports carry bilingual headers by default.
- **Tenant data.** A `Translation` table (tenant, entity, entity id, field, language, value) names the tenant's own asset classes, categories, condition labels and template parts in Georgian (D28). The API returns the name in the request's language, with English as the fallback.
- **Keys.** A coverage test fails when the `en` and `ka` key sets differ on any surface. `scripts/i18n-report.py` lists, per namespace, the keys still ⟪MT⟫ or missing.

### 2.6 Tagging and the training tenant (S3.5)

- **Preset.** The TUDA identification preset applies to new assets: asset numbers `TUDA-{CLASS}-{SEQ:6}` with a sequence per class (D31). The QR carries `https://{tenant domain}/a/{asset number}`; the EPC is GIAI-96 once a GS1 prefix is licensed, else Vairiot's 96-bit internal scheme. Existing assets keep their numbers: an asset number never changes.
- **Labels.** Two label templates: the street plate (60×40 mm: QR, number, class icon, TUDA wordmark) and the office label (50×25 mm: UHF, barcode, number). A plate batch exports as an A4 PDF at true size, with a CSV for the engraving supplier.
- **Dual identification.** A street-class asset needs both an RFID binding and a QR plate identifier before its zone can be submitted, through the zone submission rules (§2.3).
- **Training tenant.** `seed:tuda-training` creates:
  - 2,000 assets across the nine classes, along named Tbilisi avenues inside the city's bounding box;
  - three zones with boundaries and two teams;
  - an in-progress campaign;
  - sample photos and a mix of grades.

  A reset script wipes and reseeds it. `docs/TRAINING-GUIDE.md` has exercises for the Field Operator, Verifier, Inventory Manager and Finance, in English with a Georgian placeholder.

### 2.7 Release and promotion (S3.6)

- **W0 (staging).** Before W1:
  - back up staging, run the restore test, and switch staging's database to the PostGIS image;
  - deploy `dev`, letting `deploy.sh` hand MinIO's data over;
  - run the Phase 1 field checks P1.1 and P1.2 on a staging Android build.

  Staging then follows each workstream's merge.
- **W8 (freeze).**
  1. Every suite and the exit gate pass.
  2. The mobile builds are published to the TUDA tenant only.
  3. Staging is deployed with the restore test and the training seed.
  4. Production is promoted with `scripts/go-live.sh` after its own backup, the restore test and the PostGIS switch, **only on the owner's go-ahead at that point**.
  5. Tag the version, `pilot-tuda` and the accepted phases (`phase-0-accepted` to `phase-3-accepted`).
- **Change control.** `CHANGE-CONTROL.md` states that scope is frozen from the tag and that changes go through written change orders.

### 2.8 Changes to the sprint file

| Item | Sprint file | Plan |
| ---- | ----------- | ---- |
| Zone storage | `Location.boundary` "added in S1.1" | Not added in Phase 1; added in W2 (D23) |
| Reports | WeasyPrint and Jinja templates with `t()` | ReportLab, as the service is built; a translations module and a registered font (§2.5) |
| Version command | `npm run version:set` | `node scripts/bump-version.mjs` |
| Release pinned to TUDA | Through the admin release channel | Releases gain a tenant scope (D30) |
| Seeded roles | To be created | Already seeded in Phase 1; S3.1 adds the approval rules and the Verifier's permissions |
| Runs and impairments | Impairment posting through a request | Runs and impairments keep their own post step (D17) and appear in the inbox (D22) |
| Platform console | "Every surface" | The web console and both apps; the platform console stays English (D27) |
| Translation of tenant data | `Translation` table | As specified (D28), for classes, categories, condition labels and template parts |

## 3. Exit-gate tests

| Test | Pass condition |
| ---- | -------------- |
| `approvals/maker-checker.test.ts` | A Field Operator's disposal request reaches Finance's inbox; the requester cannot approve it; approval creates the `Disposal`; below the threshold the action proceeds and is logged; each action applies on approval |
| `zones/zones.test.ts` | A drawn zone assigns the positioned assets inside it, after a preview; a team's device lists only its zones; a submission missing a mandatory photo is refused with the list |
| `zones/routes.test.ts` | The route order is the same on every run, ties broken by asset number |
| `qa/sampling.test.ts` | A 5 % stratified sample is the same with the same seed; the class shares hold; the variance figures add up |
| Verifier (apps) | A verifier's scan of a sampled asset records MATCH (unit tests on both apps; on a device for the record) |
| i18n coverage | `en` and `ka` key sets equal on web, Android, iOS and reports; `scripts/i18n-report.py` lists the ⟪MT⟫ keys |
| Georgian on screen | Playwright with `ka`: every page's visible text comes from the catalogues (no English left on the main screens); a `lang=ka` report renders in Noto Sans Georgian |
| Training tenant | `seed:tuda-training` creates 2,000 positioned assets in Tbilisi; the map shows them along the avenues; a plate batch PDF is 60×40 mm per plate at 100 % scale |
| Accessibility (G34) | axe in Playwright finds no serious issue on the sign-in page and the main screens |
| Tools freeze | Every suite green; the stack gate passes; the restore test passes on staging; the release is published to TUDA only |

## 4. Decisions

| #   | Decision | Recommendation | Status |
| --- | -------- | -------------- | ------ |
| D22 | Approval scope | One generic request and rule model. Capitalisation, transfer, disposal, write-off and register-new go through requests, with thresholds per action. The requester can never approve disposal, write-off or impairment. Depreciation runs and impairments keep their D17 post step and show in the same inbox | **Approved** |
| D23 | Zone geometry | A zone is a `Location` with a `boundary` MultiPolygon in WGS 84 (GiST-indexed), so campaign scope and zone submissions stay as they are; no separate zone table | **Approved** |
| D24 | Map drawing | Leaflet-Geoman Free (MIT, maintained) for drawing and editing polygons; Leaflet.draw is unmaintained | **Approved** |
| D25 | Route order | Nearest neighbour from the zone's centroid, ties by asset number; no road routing in S3 | **Approved** |
| D26 | Sampling randomness | A seeded PRNG in `vairiot-shared` (sfc32, seed stored with the sample) over the asset ids in a fixed order, so samples can be reproduced and audited | **Approved** |
| D27 | Translation stack | Web `react-i18next`; Android string resources with per-app language; iOS string catalogue; a translations module and Noto Sans Georgian in the reports service. The platform console stays English | **Approved** |
| D28 | Tenant data in Georgian | A `Translation` table for the tenant's own names (classes, categories, condition labels, template parts), returned in the request's language with English as the fallback | **Approved** |
| D29 | Machine translation | The first Georgian is machine-made in this repository, never through an external service, and marked ⟪MT⟫ until TUDA's professional translator replaces it; `scripts/i18n-report.py` is the translator's work list | **Approved** |
| D30 | Environments and releases | Staging is promoted to `dev` at the start of Phase 3 (W0), with the PostGIS switch after a backup and restore test, so the field checks and pilot builds run there. Production is promoted only at the freeze, on the owner's go-ahead. Mobile releases gain an optional tenant scope, so the pilot build reaches TUDA only | **Approved** |
| D31 | TUDA asset numbers | `TUDA-{CLASS}-{SEQ:6}` for assets created after the preset is applied, with a sequence per class; existing assets keep their numbers | **Approved** |

## 5. Out of scope for Phase 3

- The reconciliation engine and the data-quality dashboard: S4. An impairment raised from a reconciliation item comes with it.
- Road-network routing for zone routes.
- The PPE movement note, journal export and the IPSAS reporting pack: S5.
- GeoJSON and Shapefile exchange beyond importing zone polygons: S5.2.
- Georgian in the platform console.
- The professional translation itself: TUDA's translator replaces the ⟪MT⟫ text, and Vairiot ships the tooling.
