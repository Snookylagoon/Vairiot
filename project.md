# Vairiot Asset Intelligence — Project Brief

| Item                       | Detail                                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Product                    | Vairiot Asset Intelligence (repository `Snookylagoon/Vairiot`, working copy `Vairiot-dev`)                     |
| Purpose                    | Fixed-asset management with RFID and barcode capture, offline field apps, GS1 identity and labels              |
| Client                     | TUDA — Tbilisi Transport and Urban Development Agency (current programme); SaaS tenants                        |
| Owner                      | Don Scott                                                                                                      |
| Method                     | Managed Development Standard rev 1.0 (`Vairiot CI/docs/managed-development-standard.md`), adopted in stage 0.8 |
| Source product (read-only) | None — this is the source product for Vairiot Cable Intelligence                                               |
| Started                    | 17 June 2026 (first commit); standard adopted 16 October 2026                                                  |
| Current phase              | Phase 1 (S1) in progress; Phase 0 accepted 16 October 2026                                                     |
| Version                    | 2.6.1                                                                                                          |

This file is the single source of truth (standard §1.1). If scope, a rule or a decision is not here or in a document linked from §7, it has not been agreed.

## 1. Objective

Take the platform from its July 2026 state to the system described in the TUDA fit-gap plan: hardened, GIS-enabled, IPSAS-compliant, reconciled and ready for handover, while it keeps serving production tenants. One codebase serves three deployment modes:

| Mode       | Description                                                              |
| ---------- | ------------------------------------------------------------------------ |
| Standalone | Self-hosted on client premises (TUDA). Single tenant, no internet needed |
| SaaS       | Hosted by Vairiot at `vai.vairiot.com`. Multi-tenant                     |
| Hybrid     | Local-first with cloud sync for reporting, backup and consolidation      |

## 2. Build rules (apply to every file)

1. Work inside this repository only; Vairiot CI and other products are read-only.
2. Read `docs/known-fix-registry.md` before changing code; add every non-trivial fix to it.
3. Schema changes go through a Prisma migration; migrations are additive and never edited once merged.
4. Every tenant table carries `tenantId` and every query filters by it (row-level security to follow, D5).
5. Every new API route has an OpenAPI entry, input validation, a permission guard and a Jest test.
6. Every feature belongs to a switchable module (`Tenant.featureFlags`, D7); a switched-off module answers 404 and its screens are hidden.
7. At most 500 lines per source file; split by responsibility before the limit (enforcement in W3).
8. British English in UI text, comments, documents and API messages (enforcement in W3; i18n in S3, D9).
9. Conventional commits: `<type>(<scope>): <summary>` (standard §6.2).
10. Every stage ends with a stage-log entry, a version bump where code ships, and a changelog line.
11. No secrets in the repository; `.env.example` holds `change-me-…` placeholders that `scripts/dev-setup.sh` fills.
12. Word documents are generated with Python (`python-docx`) from the Markdown; never with JavaScript or by automating Word.

## 3. Design system

| Token       | Value                                                           |
| ----------- | --------------------------------------------------------------- |
| Gradient    | `linear-gradient(90deg, #FF0DCC 0%, #A05B97 50%, #615AA0 100%)` |
| Pink        | `#FF0DCC` — Pantone 807C                                        |
| Mauve       | `#A05B97` — gradient midpoint                                   |
| Violet      | `#615AA0` — gradient end                                        |
| Charcoal    | `#2B3132` — Pantone 533C                                        |
| Font (sans) | Montserrat (headings ExtraBold)                                 |
| Font (mono) | IBM Plex Mono — codes, identifiers, coordinates                 |

## 4. Technology stack (summary)

Full list with versions in [01 Technology stack](docs/01-technology-stack.md).

| Part                    | Stack                                                                        |
| ----------------------- | ---------------------------------------------------------------------------- |
| `vairiot-api`           | Node 24, Express 5, Prisma 7, PostgreSQL 16 with PostGIS 3.5 (D11), Redis |
| `vairiot-worker`        | BullMQ job schedulers on Redis                                               |
| `vairiot-web`, `-admin` | React 19, Vite, Tailwind 4, React Router 7, TanStack Query                   |
| `vairiot-shared`        | TypeScript types, Zod schemas, GS1 and geo helpers                           |
| `vairiot-reports`       | Python 3.12, FastAPI, openpyxl, python-docx, reportlab                       |
| `vairiot-mobile`        | Kotlin, Jetpack Compose, Hilt, Room, Retrofit; Meferi and HH83 scanners      |
| `vairiot-ios`           | SwiftUI, SwiftData, XcodeGen; OTA distribution                               |
| `infra`                 | Docker Compose (dev, test, prod, standalone), nginx, certbot, MinIO          |

## 5. Domain modules

Module switches live in `Tenant.featureFlags` (`vairiot-api/src/lib/feature-flags.ts`); the full registry with dependencies and an admin screen comes in W5 (D7).

| Module / flag    | Scope                                                        | Default | Guarded today                                                             |
| ---------------- | ------------------------------------------------------------ | ------- | ------------------------------------------------------------------------- |
| Core             | Assets, sites, locations, categories, users, roles, licences | On      | Always on                                                                 |
| `blindAudit`     | Blind and double-blind audit campaigns                       | Off     | API (create campaign), web, Android                                       |
| `gis`            | Asset positions, GPS capture, asset map (S1)                 | Off     | API (`/assets/map` 404, positions ignored), web, Android, iOS — stage 0.9 |
| `ipsas`          | IPSAS ledger, depreciation, impairment (S2)                  | Off     | Not built                                                                 |
| `reconciliation` | Register-to-ledger and count-to-register reconciliation (S4) | Off     | Not built                                                                 |

Always-on capabilities include audits and scan sessions, checkouts and transfers, maintenance, exceptions, photos and documents, GS1 identity and labels, alerts, webhooks, reports, sub-tenants and two-factor authentication.

## 6. Phase plan

Decision D1: Phase N is Sprint SN; sprint files keep their names and serve as the phase plan and record.

| Phase | Sprint | Scope                                                                       | Plan / record                                                                 | Status                                                                                       |
| ----- | ------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 0     | S0     | Hardening and hosting; standard adoption (stages 0.8–0.10)                  | `docs/sprints/S0-hardening-and-hosting.md` / `S0-summary.md`                  | **Accepted 16 October 2026**                                                                 |
| 1     | S1     | GIS, condition and photos                                                   | `docs/sprints/S1-gis-condition-photos.md`, [03 plan](docs/03-phase-1-plan.md) | **Accepted** 16 Oct 2026 ([04 record](docs/04-phase-1-record.md)); field checks P1.1–P1.2 follow |
| 2     | S2     | IPSAS ledger, policies, depreciation, Excel import                          | `docs/sprints/S2-ipsas-ledger-import.md`, [05 plan](docs/05-phase-2-plan.md) | In progress — D14–D21 approved; W1 from stage 2.1                                            |
| 3     | S3     | Maker–checker, zones and teams, QA sampling, Georgian i18n, training tenant | `docs/sprints/S3-zones-qa-georgian.md`                                        | Planned                                                                                      |
| 4     | S4     | Pilot defects, reconciliation engine, data-quality dashboard                | `docs/sprints/S4-reconciliation-and-dq.md`                                    | Planned                                                                                      |
| 5     | S5     | IPSAS reporting pack, GeoJSON/Shapefile exchange, handover                  | `docs/sprints/S5-reporting-and-handover.md`                                   | Planned                                                                                      |

Adoption workstreams W0–W6 from the [adoption plan](docs/standard-adoption-plan.md) §4: W0, W1a, W1 and W2 built in stage 0.9; W3 built in stage 0.10; W4–W6 placed in S1–S3.

## 7. Documentation set

| Document                                                                                                             | Purpose                                                |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `project.md`                                                                                                         | This brief — single source of truth                    |
| [CHANGELOG.md](CHANGELOG.md)                                                                                         | User-facing changes by version                         |
| [docs/stage-log.md](docs/stage-log.md)                                                                               | Every stage: what was done, produced and decided       |
| [docs/standard-adoption-plan.md](docs/standard-adoption-plan.md)                                                     | Stage 0.8 audit against the standard (G1–G20), W0–W6   |
| [docs/00-discovery-and-architecture.md](docs/00-discovery-and-architecture.md)                                       | Findings, architecture, security model, risks          |
| [docs/01-technology-stack.md](docs/01-technology-stack.md)                                                           | Components, versions, upgrade policy                   |
| [docs/02-data-model-and-module-registry.md](docs/02-data-model-and-module-registry.md)                               | Data model and module switches                         |
| [docs/03-phase-1-plan.md](docs/03-phase-1-plan.md)                                                                   | Phase 1 plan: workstreams, design, exit gates, D11–D12 |
| [docs/04-phase-1-record.md](docs/04-phase-1-record.md)                                                               | Phase 1 record: exit gate results, open points, acceptance |
| [docs/05-phase-2-plan.md](docs/05-phase-2-plan.md)                                                                   | Phase 2 plan: workstreams, ledger design, exit gates, D14–D21 |
| [docs/GIS-DATA-MODEL.md](docs/GIS-DATA-MODEL.md)                                                                     | GIS database structure (TOR Deliverable D4)            |
| [docs/testing/test-plan.md](docs/testing/test-plan.md)                                                               | Test levels, coverage, exit gates, traceability        |
| [docs/testing/manual-checks.md](docs/testing/manual-checks.md)                                                       | Manual What / Steps / Pass / Fail checks on staging    |
| [docs/known-fix-registry.md](docs/known-fix-registry.md)                                                             | Lessons from defects (KFR-001 onwards)                 |
| [docs/sprints/](docs/sprints/README.md)                                                                              | Sprint (phase) plans and records S0–S5                 |
| [docs/AUDIT-2026-07-19.md](docs/AUDIT-2026-07-19.md)                                                                 | July 2026 platform audit                               |
| [DEPLOY.md](DEPLOY.md), [docs/STAGING-SETUP.md](docs/STAGING-SETUP.md), [docs/DEV-WORKFLOW.md](docs/DEV-WORKFLOW.md) | Deployment, staging and branch workflow                |
| `docs/word/`                                                                                                         | Python generators and branded Word reports             |
| Package `README.md` files                                                                                            | How to build, run and test each package                |

## 8. Decision log

| Date        | Decision                                                                                                                                                                    | Status                |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 16 Oct 2026 | D1: Phase N = Sprint SN; S0 is Phase 0, the standard adoption audit is stage 0.8, S1 is Phase 1                                                                             | **Approved**          |
| 16 Oct 2026 | D2: adoption gaps use the prefix `G` (G1–G20) to avoid clashing with sprint ids                                                                                             | **Approved**          |
| 16 Oct 2026 | D3: reset to one lockstep version `2.0.0` across npm, reports, Android and iOS; `v1.10.1` tagged as the historical baseline; post-1.0 SemVer from then on                   | **Approved**          |
| 16 Oct 2026 | D4: `docs/Demo Passwords.xlsx` — no action now; carried as open point G7                                                                                                    | **Deferred by owner** |
| 16 Oct 2026 | D5: row-level security adopted table by table behind a Prisma extension, starting with `Asset`, `AuditEvent`, `Photo`                                                       | **Approved**          |
| 16 Oct 2026 | D6: two-factor mandatory for Administrator and platform-admin with a 14-day grace period; Field Operator excluded (shared scanners)                                         | **Approved**          |
| 16 Oct 2026 | D7: module registry built from `featureFlags`; GIS hidden now behind the `gis` flag                                                                                         | **Approved**          |
| 16 Oct 2026 | D8: coverage ratchet — API 50 → 80 % lines over S1–S3; other packages 60 % by S2, 80 % by S4                                                                                | **Approved**          |
| 16 Oct 2026 | D9: i18n and the language rules folded into S3 (Georgian i18n)                                                                                                              | **Approved**          |
| 16 Oct 2026 | D10: defect severities are named Sev1–Sev4 (not S1–S4, which clash with sprint ids)                                                                                         | **Approved**          |
| 16 Oct 2026 | Phase 0 accepted by the owner ("Do 1, 2 and 3": merge #85 and #86, accept Phase 0, start Phase 1), with open points G7 and G21–G29 handled as proposed in the adoption plan | **Approved**          |
| 16 Oct 2026 | D11: database image `postgis/postgis:16-3.5-alpine` everywhere (Phase 1 plan §4)                                                                                            | **Approved** |
| 16 Oct 2026 | D12: Leaflet as the web map library, with a Leaflet drawing plugin for S3 zones                                                                                             | **Approved** |
| 16 Oct 2026 | D13: photo originals keep their metadata as evidence and every copy leaving the API is stripped (KFR-043); capture time and GPS read into columns on upload | **Approved** |
| 16 Oct 2026 | Phase 1 accepted by the owner, with field checks P1.1 (Meferi position outdoors) and P1.2 (grade-2 photo prompt on a device) to follow and be recorded when done | **Approved** |
| 16 Oct 2026 | D14: ledger arithmetic in `Prisma.Decimal`, never `Number`; half-up to 2 places per entry, remainder in the last month of life (Phase 2 plan §4) | **Approved** |
| 16 Oct 2026 | D15: monthly periods in the tenant's time zone; full month in the start month, none in the disposal month | **Approved** |
| 16 Oct 2026 | D16: permissions `accounting:read`, `accounting:write`, `accounting:approve` | **Approved** |
| 16 Oct 2026 | D17: append-only ledger entries corrected by reversal; preparer and approver must differ until S3.1 | **Approved** |
| 16 Oct 2026 | D18: `exceljs` for spreadsheets; `.xls` refused | **Approved** |
| 16 Oct 2026 | D19: Zod schemas in `vairiot-shared` for the ledger and import routes; OpenAPI stays hand-written, with a contract test | **Approved** |
| 16 Oct 2026 | D20: asset class required on create with `ipsas` on; back-fill from the category, else PENDING_REVIEW | **Approved** |
| 16 Oct 2026 | D21: units of production entered per asset and period; no automatic feed in S2 | **Approved** |
