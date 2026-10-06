# Sprint 5 — IPSAS reporting, GIS exchange and handover (weeks 23–28)

**Goal:** produce the reports that make up Deliverables D7 and D8, exchange data with TUDA's GIS, and hand everything over as TUDA property in open formats.

**Fit-gap items:** 21 (reports: PPE movement note, QA, discrepancy actions, journal export), 12 (GeoJSON / Shapefile exchange), 22 (handover pack).

**Branch:** `feature/s5-reporting-handover`

---

## Prompt S5.1 — IPSAS reporting pack and journal export

```
Build the IPSAS 45 reporting pack and an illustrative journal export in vairiot-reports.

Context:
- Path: /Volumes/DRSssd/Projects/GitHub/Vairiot-dev/vairiot-reports (Python, FastAPI, WeasyPrint for PDF, openpyxl for Excel; reports under app/reports/<area>/*.py; templates under app/templates)
- Data from S2: AssetClass with GL accounts, DepreciationEntry, DepreciationRun, Impairment, Disposal, Asset.acquisitionType and capitalisedCost, AccountingPeriod
- Design: A4, 12 mm margins, footer pinned to the bottom; bilingual English / Georgian headings (S3.4); Montserrat with Noto Sans Georgian fallback
- Outputs must be editable: every PDF report also exports to Excel (openpyxl) with the same figures

Steps:
1. ppe_movement_note.py — the IPSAS 45 reconciliation of carrying amount per class for a period range: opening cost, additions (by acquisitionType), disposals, transfers in/out, impairment, revaluation, closing cost; opening accumulated depreciation, charge, disposals, impairment, closing; opening and closing NBV. Totals must tie to DepreciationEntry and Disposal data; include a "tie-out" row set showing register NBV equals note NBV.
2. fixed_asset_register_ipsas.py — full register at a date with class, GL accounts, recognition status, acquisition type, capitalised cost, accumulated depreciation, accumulated impairment, NBV, remaining life, custodian, site, position and last verified date; filter options; Excel with one sheet per class.
3. journal_export.py — illustrative journal lines for a period: depreciation (Dr expense / Cr accumulated), impairment (Dr loss / Cr accumulated impairment), disposal (Dr accumulated, Dr/Cr gain-loss, Cr asset cost), donated assets (Dr asset / Cr non-exchange revenue), recognition from reconciliation (Dr asset / Cr prior-period adjustment), derecognition (Dr prior-period adjustment / Cr asset); CSV and Excel in a column layout configurable per tenant (date, account, debit, credit, memo, asset number) so TUDA's accounting system can import it.
4. qa_report.py — campaign QA for D6: sample results, recount variance by team and zone, photo and position coverage, DQ scores over time (from S3.3 and S4.4 data).
5. discrepancy_action_list.py — every reconciliation and three-way item with its classification, proposed action, approval status, owner and due date; feeds D8's action plan.
6. inventory_results.py — the headline results for D8: expected v found v surplus v missing by class, zone and site, with value; condition distribution; impairment candidates; disposal candidates.
7. Register all six in app/reports/__init__.py, add them to vairiot-web/src/pages/reports (ReportsPage index and a page each, using GenericReportPage where possible), and to ReportSchedule so they can be emailed monthly.
8. Tests: a pytest fixture tenant with known entries; the movement note ties to the penny; journal debits equal credits.

Output:
- Six report modules with PDF and Excel outputs, web pages, schedule entries, tests
- Files changed, with full paths

Think before answering (maximum reasoning).
```

**Acceptance:** `pytest vairiot-reports` passes; the movement note closing NBV equals the register NBV on the same date; journal export balances.

---

## Prompt S5.2 — GeoJSON and Shapefile import / export

```
Add GIS data exchange so TUDA's GIS team can import and export assets, zones and campaign results.

Context:
- Path: /Volumes/DRSssd/Projects/GitHub/Vairiot-dev/vairiot-api and vairiot-reports
- PostGIS from S1.1; ExternalGisFeature from S4.3; zones as Location.boundary; vairiot-reports has Python where GeoPandas, Fiona and pyproj are easier than Node libraries
- CRS: store WGS 84; TUDA may supply or require another CRS (ask for the EPSG code at import/export time; default 4326)

Steps:
1. Export endpoints in vairiot-reports (served through the API gateway): `GET /gis/export?layer=assets|zones|scans|reconciliation&format=geojson|shapefile|gpkg&campaignId=&crs=EPSG:xxxx` producing a GeoJSON file, a zipped Shapefile (.shp/.shx/.dbf/.prj/.cpg, UTF-8, field names ≤ 10 characters with a sidecar CSV mapping long names) or a GeoPackage; attributes: asset number, GIAI, class code, name, condition grade, status, NBV, site, location, last verified, photo count, reconciliation classification.
2. Import: extend the S2.5 wizard with a GIS mode that accepts GeoJSON, zipped Shapefile or GeoPackage; reproject to 4326 with pyproj; map attributes to asset fields or to ExternalGisFeature (for three-way reconciliation); match on gisFeatureId or by position tolerance; preview on the map before commit.
3. Zone import: polygons into Location.boundary with a name mapping.
4. Validate geometry (ST_IsValid), reject empty geometries with a row-level error, and record the source CRS on each asset.
5. Web: an Export button on MapPage and the campaign dashboard with layer, format and CRS choices; GIS import entry in the import wizard.
6. Document the schema in docs/GIS-DATA-MODEL.md (started in S1.6): attribute dictionary, coding conventions, CRS policy — this is the "GIS database structure and coding conventions" item of Deliverable D4 and part of D7.
7. Tests: round trip (export → import) preserves asset count and positions within 0.5 m; Shapefile field-name truncation is reversible.

Output:
- Export and import code, wizard mode, map buttons, documentation, tests
- Files changed, with full paths

Think before answering (maximum reasoning).
```

**Acceptance:** exported Shapefile opens in QGIS with correct positions; re-importing it links every feature to its asset.

---

## Prompt S5.3 — Handover pack and whole-tenant export

```
Build a one-click handover pack that exports everything TUDA owns under the TOR in open formats.

Context:
- Path: /Volumes/DRSssd/Projects/GitHub/Vairiot-dev
- The audit noted no whole-tenant export exists; MinIO holds photos and documents under tenant-prefixed keys; backup.sh from S0.5 produces encrypted archives for Vairiot's own use, which is not a client handover
- TOR: all manuals, reports, tables, working files, databases, GIS files and photographs are TUDA property, delivered in editable electronic form, in English and Georgian

Steps:
1. Add a BullMQ job handover-export.ts that builds a ZIP (streamed to MinIO, then a time-limited download link) containing: /database/ a PostgreSQL custom-format dump of the tenant's rows only plus the same data as CSV per table with a data dictionary; /register/ the IPSAS register and movement note in Excel and PDF, both languages; /gis/ GeoJSON, Shapefile and GeoPackage for assets, zones and campaign results; /photos/ every photo and thumbnail named `<assetNumber>/<campaign>/<timestamp>.jpg` with an index CSV (asset, scan, position, time, hash); /documents/ attached documents; /reports/ every D6–D8 report rendered at export time; /audit-trail/ AuditEvent and AssetEvent exports; /manifest.json with counts, SHA-256 per file and the software version.
2. Route `POST /api/v1/tenant/handover-export` (Administrator role, approval-free but logged) and `GET /api/v1/tenant/handover-export/:id` for status and link; admin page section with history.
3. Add a "licence continuation" note generator: a PDF stating the data is the client's, the licence terms for continued use of the platform, and the support options (figures from tenant settings).
4. Size handling: photos may exceed 10 GB; split into numbered volumes of 2 GB and list them in the manifest.
5. Tests: manifest hashes verify; a tenant with 1,000 assets and 2,000 photos exports in under 10 minutes on the staging host; no other tenant's rows appear in the dump (cross-tenant test).

Output:
- Export job, routes, admin page, note generator, tests
- Files changed, with full paths

Think before answering (maximum reasoning).
```

**Acceptance:** the pack restores into a clean PostgreSQL with `pg_restore` and the counts match the manifest; a cross-tenant check finds no leakage.

---

## Prompt S5.4 — Final acceptance release and documentation

```
Prepare the final release and the documentation set for Deliverables D7 and D8 and for TUDA's operations team.

Steps:
1. Run every test suite, the restore test and a handover export on staging; fix failures.
2. Bump to 2.2.0; build and publish Android and iOS releases; deploy to production.
3. Write or update: docs/ADMIN-GUIDE.md (tenant settings, users and roles, approvals, periods, imports, exports, backups), docs/FIELD-OPERATOR-GUIDE.md (device set-up, scanning, zones, photos, condition, offline behaviour, pending uploads), docs/FINANCE-GUIDE.md (classes, recognition, depreciation runs, impairment, journal export, movement note), docs/API-REFERENCE.md generated from the OpenAPI spec, and docs/OPERATIONS-RUNBOOK.md (deploy, monitor, back up, restore, rotate secrets, certificate renewal). Each guide is in English with a Georgian section placeholder for the translator.
4. Generate docs/SOURCE-INVENTORY.md listing every workspace, its purpose, build command and test command, for the "working files" clause of the TOR.
5. Write docs/sprints/S5-summary.md and a project-level docs/sprints/PROJECT-SUMMARY.md listing all sprints, releases, open items and the full list of files changed across the project (from git log between the S0 start tag and HEAD).
6. Tag v2.2.0 and open the pull request to main.

Output:
- Release, documentation set, project summary, tag, pull request URL

Think before answering (maximum reasoning).
```

---

## Sprint checklist

- [ ] S5.1 IPSAS reporting pack and journal export
- [ ] S5.2 GeoJSON / Shapefile exchange
- [ ] S5.3 Handover pack
- [ ] S5.4 Final release v2.2.0 and documentation
