# Stage Log

A running record of every stage of Vairiot Asset Intelligence: what was done, what it produced and what was decided (standard §2.3, template §16.2). A new entry is added at the end of each stage. **Stage numbers are unique: check the last one before adding.**

Phase N is Sprint SN (decision D1). Stages 0.1–0.7 and 1.1–1.3 were done before the standard was adopted and are back-filled from `docs/sprints/S0-summary.md` and the commit history; they carry no version because the product version was not kept until 2.0.0.

---

## Phase 0 — Hardening and hosting (Sprint S0)

### Stage 0.1 — Audit triage and sprint baseline

| Item      | Detail                                                                         |
| --------- | ------------------------------------------------------------------------------ |
| Date      | 5 October 2026                                                                 |
| Version   | —                                                                              |
| Activity  | Triaged the July 2026 platform audit into S0 work, later sprints and deferrals |
| Output    | `docs/sprints/S0-audit-triage.md`; commit `429f7b4`                            |
| Decisions | —                                                                              |
| Notes     | Branch `feature/s0-hardening` from `dev` at `16df41e`                          |

### Stage 0.2 — Android offline queue never loses field work

| Item     | Detail                                                                                                                      |
| -------- | --------------------------------------------------------------------------------------------------------------------------- |
| Date     | 5 October 2026                                                                                                              |
| Version  | —                                                                                                                           |
| Activity | One queue model (waiting, retrying, rejected); shared idempotency key online and offline; destructive Room fallback removed |
| Output   | Commit `0afbb4c`; Room migration 6 → 7; Profile → Pending uploads                                                           |

### Stage 0.3 — iOS offline parity; blind audits fixed

| Item     | Detail                                                                                    |
| -------- | ----------------------------------------------------------------------------------------- |
| Date     | 5 October 2026                                                                            |
| Version  | —                                                                                         |
| Activity | Background sync, retry with backoff, offline photos; blind audits send zone and condition |
| Output   | Commit `56f4ae0`                                                                          |
| Notes    | iOS blind audits had been rejected on every attempt before this stage                     |

### Stage 0.4 — Server sync hardening, delta sync, iOS enrolment checks

| Item     | Detail                                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------------------------- |
| Date     | 5 October 2026                                                                                                          |
| Version  | —                                                                                                                       |
| Activity | Per-user sync rate limits, gzip, `GET /assets?changedSince=`, duplicates resolved before the licence cap, SEC-H2 checks |
| Output   | Commits `9b193d8`, `e28eba2` (flaky macOS API tests fixed)                                                              |

### Stage 0.5 — Backups, restore test, safe deploys, alerts

| Item     | Detail                                                                                                      |
| -------- | ----------------------------------------------------------------------------------------------------------- |
| Date     | 6 October 2026                                                                                              |
| Version  | —                                                                                                           |
| Activity | Encrypted off-site backups, isolated restore test, migration-first deploys, alerts; MinIO built from source |
| Output   | Commits `412145c`, `d68f8dd`; `infra/backup.sh`, `infra/restore-test.sh`, `infra/deploy.sh`                 |
| Notes    | Server activation steps are manual (DEPLOY.md)                                                              |

### Stage 0.6 — TUDA tenant, standalone install, register profiler

| Item     | Detail                                                                                     |
| -------- | ------------------------------------------------------------------------------------------ |
| Date     | 6 October 2026                                                                             |
| Version  | —                                                                                          |
| Activity | `seed:tuda` (with `gis`, `ipsas`, `reconciliation` on), standalone Compose stack, profiler |
| Output   | Commit `c51b080`; `infra/docker-compose.standalone.yml`, `scripts/profile-register.py`     |

### Stage 0.7 — Sprint close

| Item     | Detail                                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------------------- |
| Date     | 6 October 2026                                                                                                  |
| Version  | —                                                                                                               |
| Activity | Sprint summary and triage status; merged through PR #55                                                         |
| Output   | `docs/sprints/S0-summary.md`                                                                                    |
| Tests    | API 230/230; worker 5/5; shared 42/42; web 12/12; Android 62/62; iOS 41/41; profiler 17/17                      |
| Notes    | Open items listed in the summary §What remains open. Security follow-ups KFR-037–043 landed 14 October (PR #82) |

### Stage 0.8 — Standard adoption audit

| Item      | Detail                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------ |
| Date      | 16 October 2026                                                                                                    |
| Version   | —                                                                                                                  |
| Activity  | Audited `main` at `9f0f8ee` against the Managed Development Standard §17; raised gaps G1–G20 and D1–D9             |
| Output    | `docs/standard-adoption-plan.md` (revision 0.2)                                                                    |
| Decisions | D1–D9 decided by the owner the same day: D3 alternative A (reset to 2.0.0); D4 deferred; the rest as recommended   |
| Notes     | Gitleaks over history found nothing, but it cannot read `docs/Demo Passwords.xlsx`, which holds passwords (G7, D4) |

### Stage 0.9 — Secrets, GIS behind its flag, versioning, documentation set (W0, W1a, W1, W2)

| Item      | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date      | 16 October 2026                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Version   | 2.0.0 (Android code 36 and iOS build 12 unchanged until the next distributed build: 37 / 13)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Activity  | **W0:** `.env.example` uses `change-me-…` placeholders (with `SEED_DEMO_PASSWORD`); `scripts/dev-setup.sh` generates them; `.env.*` ignored except templates; `.gitleaks.toml`. **W1a:** GIS behind `gis` — `requireFeature` guard (map 404), positions ignored when off, web/Android/iOS screens hidden, flags cached on both apps. **W1:** `scripts/bump-version.mjs` (`npm run check:versions`, in CI), every version file at 2.0.0, `vairiot-reports/pyproject.toml`, `CHANGELOG.md`, tag `v1.10.1` on `5ac4c88`. **W2:** `project.md`, this log, foundation documents 00–02, test plan, package READMEs, Word generator |
| Output    | API: `middleware/require-feature.ts`, `services/tenant-features.service.ts`, `resolveTenantAssetGeo`. Web: `hasFeature`, `RequireFeature`. Android: `data/FeatureFlags.kt`. iOS: `Data/FeatureFlags.swift`                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Tests     | API full suite 321/321 in 34 suites (new `asset-gis-toggle.test.ts`); worker 5/5; shared 64/64; web 28/28 (new `hasFeature.test.ts`); Android unit tests pass; iOS 54/54 (new `FeatureFlagsTests`, `testNoPositionIsSentWhileGisIsOff`)                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Decisions | D3, D7 applied                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Notes     | Existing production tenants lose the GIS screens until `gis` is switched on for them. The web import page still offers latitude/longitude columns; the API ignores them while GIS is off. Tags not yet pushed                                                                                                                                                                                                                                                                                                                                                                                                                |

### Stage 0.10 — Enforcement and CI (W3)

| Item      | Detail                                                                                                                                                                                                                                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date      | 16 October 2026                                                                                                                                                                                                                                                                                                              |
| Version   | 2.0.1                                                                                                                                                                                                                                                                                                                        |
| Activity  | Copied and adapted from Vairiot CI: `check-line-limits.sh` (with `line-limit-baseline.txt`, 16 files, shrink-only), `check-british-english.mjs` (skips CSS and Tailwind names), Husky `pre-commit` and `commit-msg`, `commitlint.config.mjs`, `.editorconfig`, PR template, `npm run check`. `.npmrc` `min-release-age=7`; Dependabot `cooldown` 7 days and majors ignored. CI: top-level `permissions: contents: read`, concurrency, every action pinned by SHA, timeouts on every job, line and spelling checks, `security` job (npm audit, Gitleaks 8.30.1, Trivy 0.75.0, Semgrep 1.179.0 with a merge-base baseline), JUnit and coverage artefacts, Android unit tests, new `ios.yml` |
| Output    | `scripts/check-line-limits.sh`, `scripts/line-limit-baseline.txt`, `scripts/check-british-english.mjs`, `.husky/`, `commitlint.config.mjs`, `.editorconfig`, `.trivyignore`, `.github/pull_request_template.md`, `.github/workflows/{ci,android,ios}.yml`, `.github/dependabot.yml`                                          |
| Tests     | `npm run check` passes (0 lint errors, 75 warnings as before); worker 5/5, shared 64/64, web 28/28; npm audit (high) clean; Gitleaks clean; Trivy clean with the DS-0002 ignore; Semgrep 62 existing findings triaged as G27                                                                                                 |
| Decisions | D10 approved: defect severities Sev1–Sev4                                                                                                                                                                                                                                                                                    |
| Notes     | Lint-staged runs ESLint only, because Prettier would reformat 315 of 334 sources (G28). The iOS workflow and the security job have not yet run on GitHub (G29). Phase 0 is ready for owner acceptance                                                                                                                        |

---

## Phase 1 — GIS, condition and photos (Sprint S1)

Started before Phase 0 was accepted, so stages 1.1–1.3 come before the hand-over in time. New work continues from stage 1.4.

### Stage 1.0 — Phase 0 accepted; Phase 1 planned

| Item      | Detail                                                                                                                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date      | 16 October 2026                                                                                                                                                                                |
| Version   | 2.0.1                                                                                                                                                                                          |
| Activity  | Owner accepted Phase 0 ("Do 1, 2 and 3"), open points handled as proposed. Sprint files amended: SemVer from 2.0.0 instead of the fixed 2.0.0-pilot / 2.1.0 / 2.2.0 plan, `dev` instead of `develop` (G22), Leaflet instead of MapLibre (G25). Phase 1 plan written |
| Output    | `docs/03-phase-1-plan.md`; `docs/sprints/README.md`, `S1`–`S5` amended; `project.md` decision log                                                                                             |
| Decisions | Phase 0 acceptance recorded; D11 (PostGIS image) and D12 (Leaflet) raised as proposed                                                                                                          |
| Notes     | Tags `phase-0-accepted` and `v2.0.1` wait for the promotion of `dev` to `main`. PRs #85 and #86 await the owner's merge: this session's permissions do not allow merging without review |

### Stage 1.1 — GIS position module for assets (S1.1, part)

| Item     | Detail                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------ |
| Date     | 12 October 2026                                                                                        |
| Version  | —                                                                                                      |
| Activity | Latitude, longitude, accuracy, source, capture time on `Asset`; validation in `vairiot-shared/src/geo` |
| Output   | Commit `5f78644`; migration `20261012000000_asset_gis_position`                                        |
| Notes    | PostGIS, scan-event positions and the source CRS from the S1.1 prompt are not built yet                |

### Stage 1.2 — GPS capture in the Android and iOS apps (S1.2)

| Item     | Detail                                                   |
| -------- | -------------------------------------------------------- |
| Date     | 12 October 2026                                          |
| Version  | —                                                        |
| Activity | Capture, display and offline queueing of asset positions |
| Output   | Commit `98def6b`                                         |

### Stage 1.3 — All-assets map view (S1.4)

| Item     | Detail                                                   |
| -------- | -------------------------------------------------------- |
| Date     | 12 October 2026                                          |
| Version  | —                                                        |
| Activity | `GET /assets/map`, clustered map page in the web console |
| Output   | Commit `10ad7ba`; merged through PR #70                  |
