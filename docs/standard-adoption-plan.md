# Managed Development Standard — Adoption Audit and Plan

| Item     | Detail                                                                                                    |
| -------- | --------------------------------------------------------------------------------------------------------- |
| Product  | Vairiot Asset Intelligence (`Vairiot-dev`)                                                                |
| Standard | Managed Development Standard rev 1.0 (16 October 2026), `Vairiot CI/docs/managed-development-standard.md` |
| Audited  | `origin/main` at `9f0f8ee` (release #84), 16 October 2026                                                 |
| Stage    | 0.8 — Standard adoption audit (proposed, see D1)                                                          |
| Revision | 0.2 — decisions recorded (16 October 2026)                                                                |
| Status   | **D1–D9 decided by the owner 16 October 2026** (D3 alternative A; D4 deferred)                            |

---

## 1. Summary

Vairiot Asset Intelligence is in production (Android and iOS at 1.10.1) and has a working method of its own: sprint scripts S0–S5, a known-fix registry (KFR-001…043), a sprint summary for S0 and a manual test plan. It is **not** yet run to the standard. The main gaps are:

1. **A committed credentials file.** `docs/Demo Passwords.xlsx` holds role, e-mail, organisation id and password for three demo tenants. It is in `main` and in history since `f4a0a9b`. Action deferred by the owner (D4).
2. **No single source of truth.** No `project.md`, stage log, decision log or numbered foundation documents.
3. **Versioning never applied.** Every `package.json` is `1.0.0` and has never moved; the mobile apps are `1.10.1` (Android `versionCode 36`, iOS build `12`) and have not moved since 5 August, although S0 and the GIS work changed both apps since. No tags, no `CHANGELOG.md`, the reports service has no version.
4. **Rules not enforced by machines.** No Husky hooks, Commitlint, line-limit or British English check, `.editorconfig`, PR template or `npm run check`. 16 source files exceed 500 lines. 70 % of `main`'s commits follow conventional format, by habit only.
5. **Security controls partial.** No row-level security (tenancy is hand-written `where: { tenantId }`); two-factor exists but is mandatory for nobody; containers run as root; `/health/metrics` reaches the internet; CI has no security job and actions are pinned by tag.
6. **No module registry.** `Tenant.featureFlags` exists, but only `blindAudit` is enforced; the `gis` flag is never read, so the new GIS position work shows for every tenant.
7. **Tests thin outside the API.** API coverage threshold 50 % lines; admin and reports have no tests; Android and iOS tests never run in CI.

None of this blocks the current S1 sprint. The plan below closes the gaps in seven workstreams, ordered as the standard's §17 requires (secrets → security → enforcement → tests → versioning and documents → tidy-up), with **versioning and documentation done first in parallel** because they are cheap and unblock the stage log for everything after.

---

## 2. Audit result (§17)

Verdict: **Meets** / **Partial** / **Gap**. Gap ids use the prefix **G** (see D2).

| #   | Check                                             | Verdict | Evidence                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | `project.md` with rules, phases, decisions, index | Gap     | Not present. Scope lives in `docs/sprints/README.md`; brand tokens in `README.md`                                                                                                                                                                                                                    |
| G2  | Stage log current, stage numbers unique           | Gap     | No `docs/stage-log.md`. S0 stages S0.1–S0.7 are recorded in `docs/sprints/S0-summary.md`                                                                                                                                                                                                             |
| G3  | Every source file ≤ 500 lines                     | Gap     | 16 files over; worst `report-export.service.ts` 1440, `LabelDesignView.swift` 1079, `LabelsPage.tsx` 992, `platform-admin.service.ts`, `ScanSessionScreen.kt` 731, `audit.service.ts` 696, `openapi.ts` 682. 10 more at 400–500                                                                      |
| G4  | British English check                             | Gap     | No checker. Identifiers are mostly British (`licence`, `authorise`); `color`/`center` hits are framework APIs → allow list                                                                                                                                                                           |
| G5  | Lint, format, strict type-check (`npm run check`) | Partial | ESLint flat config and Prettier exist; no `check` script, no `.editorconfig`, strictness not verified per package                                                                                                                                                                                    |
| G6  | Husky hooks; conventional commits                 | Partial | No `.husky/`, no Commitlint. 280 of 398 commits on `main` conventional                                                                                                                                                                                                                               |
| G7  | No secrets in repository or history               | **Gap** | `docs/Demo Passwords.xlsx` (3 tenants × 12 rows with passwords). Gitleaks over history: 0 findings (it does not read `.xlsx`). `auto-login.html` already removed in KFR-037                                                                                                                          |
| G8  | `.env.example` complete; `.env*` ignored          | Partial | `.env.example` present; `.gitignore` covers `.env`, `*.env`, `.env.*.local` but not `.env.*` generally; no `dev-setup.sh` generating secrets                                                                                                                                                         |
| G9  | Lock file, no high advisories, 7-day cooling-off  | Partial | Lock file committed; `npm audit` 0 high (4 moderate); `.npmrc` has retries but no `min-release-age=7`; Dependabot has no `cooldown`, majors not excluded; 22 Dependabot branches open                                                                                                                |
| G10 | CI least privilege, SHA pins, timeouts, security  | Gap     | No top-level `permissions`; actions pinned by tag; one job has a timeout; no audit/Semgrep/Trivy/Gitleaks; no JUnit/coverage artefacts; no iOS workflow; Android workflow runs no tests                                                                                                              |
| G11 | Unit tests per package; coverage ≥ 80/70          | Gap     | API 30+ Jest files on a real Postgres (threshold 50 % lines); web 6; shared 3; worker 1; **admin 0**; **reports 0**; Android 9 files, 62 tests (not run in CI); iOS 6 (not run in CI)                                                                                                                |
| G12 | Module registry, guards, toggle matrix            | Gap     | `vairiot-api/src/lib/feature-flags.ts` declares `blindAudit`, `gis`, `ipsas`, `reconciliation`; only `blindAudit` enforced; no route guard per module, no nav hiding, no admin toggle screen, no toggle test                                                                                         |
| G13 | Row-level security; cross-tenant test             | Gap     | No `ENABLE ROW LEVEL SECURITY` in any migration; ORM filter by hand; scope middleware now mounted (KFR-040) but no systematic cross-tenant suite                                                                                                                                                     |
| G14 | Audit trail on CUD, sign-in, export, toggle       | Partial | `AuditEvent` covers sign-in, 2FA, admin actions, invites, roles, API keys. Missing: exports, flag changes, failed sign-ins in the trail; fire-and-forget writes can be lost; `AuditEvent` not hash-chained (`AssetEvent` already is: append-only, hash-chained per asset, update and delete blocked) |
| G15 | Two-factor for privileged roles                   | Partial | TOTP, encrypted secret, hashed backup codes, admin reset all built; `ROLES_REQUIRING_2FA = []` (opt-in since `fcb5a27`)                                                                                                                                                                              |
| G16 | Containers non-root, read-only, minimal ports     | Partial | Only nginx publishes ports (good). No `USER` in any Dockerfile; no `read_only`/`cap_drop`; `/health/metrics` unauthenticated and proxied publicly                                                                                                                                                    |
| G17 | Versions consistent; tags; `CHANGELOG.md`         | **Gap** | npm `1.0.0` ×6, mobile `1.10.1`, reports none; 0 tags; no changelog                                                                                                                                                                                                                                  |
| G18 | Known-fix registry present                        | Meets   | `docs/known-fix-registry.md`, KFR-001…043 (format differs from §16.6 table rows — keep, add a summary table)                                                                                                                                                                                         |
| G19 | Word reports generated by Python from Markdown    | Gap     | `docs/Vairiot-Platform-Audit-2026-07-19.docx` has no generator in the repository; KFR-001 refers to docx-js                                                                                                                                                                                          |
| G20 | Merged branches and stale worktrees removed       | Gap     | 6 extra worktrees (5 under `.claude/worktrees/`, 1 sibling); ~17 merged remote branches; 22 Dependabot branches; local `feat/asset-gis-position` merged in #70                                                                                                                                       |

Further findings outside §17: no i18n at all (hard-coded strings, `lang="en"`, no Android/iOS catalogues); OpenAPI hand-written, shared Zod contracts limited to auth; `README.md` out of date (Node 22, React 18, "Sprint 1 — Foundation", PRs to `develop`).

---

## 3. Decisions

Decided by the owner on 16 October 2026. D1–D9 continue as the product's single decision series (§13).

| #   | Decision                                                                                                                                                                                                                                          | Status                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| D1  | **Phase N = Sprint SN.** S0 is Phase 0 (plan `S0-hardening-and-hosting.md`, record `S0-summary.md`, stages 0.1–0.7 done); this audit is **Stage 0.8**; S1 is Phase 1 from Stage 1.0. Sprint files keep their names                                | **Approved**          |
| D2  | Adoption gaps use the prefix **`G`** (G1–G20), not `S`, which would collide with sprint ids                                                                                                                                                       | **Approved**          |
| D3  | **Version reset to `2.0.0`** in lockstep across npm, reports, Android and iOS, marking adoption of the standard; post-1.0 SemVer from then on. `v1.10.1` tagged on the 5 August commit as the historical baseline only (alternative A)            | **Approved**          |
| D4  | `docs/Demo Passwords.xlsx`: **no action now.** Carried as open point G7; rotation, deletion and any history rewrite to be decided later                                                                                                           | **Deferred by owner** |
| D5  | Row-level security adopted table by table behind a Prisma client extension setting `app.tenant_id` per request; first `Asset`, `AuditEvent`, `Photo` (W4)                                                                                         | **Approved**          |
| D6  | Two-factor mandatory for Administrator and platform-admin roles, 14-day grace period with notice to tenants. **Field Operator is excluded**: TUDA crews share scanners, so per-person TOTP on the device is impractical                           | **Approved**          |
| D7  | Module registry in `vairiot-shared` built from `featureFlags` (`gis`, `ipsas`, `reconciliation`, `blindAudit`); GIS position work becomes `gis.positions`. **GIS is hidden now behind the existing `gis` flag**, ahead of the full registry (W1a) | **Approved**          |
| D8  | Coverage ratchet, never lowered: API 50 → 80 % lines over S1–S3; other packages 60 % by end of S2, 80 % by S4; first admin and reports tests in W5                                                                                                | **Approved**          |
| D9  | i18n and the §5 language rules folded into S3 (Georgian i18n)                                                                                                                                                                                     | **Approved**          |

---

## 4. Workstreams

| #   | Workstream                     | Gaps closed          | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Size |
| --- | ------------------------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| W0  | Secrets                        | G8 (G7 deferred, D4) | `.env.*` in `.gitignore` (except example); copy `scripts/dev-setup.sh` from Vairiot CI; Gitleaks config including a note on binary files. `Demo Passwords.xlsx` left in place until the owner decides (D4)                                                                                                                                                                                                                                                                                                                                                            | S    |
| W1a | GIS behind the `gis` flag (D7) | G12 (part)           | API: map endpoint 404 and position writes ignored when `gis` is off. Web: `GeoPositionFields` and the map view hidden. Android and iOS: GPS capture skipped and position UI hidden, read from `GET /auth/me` and cached for offline use. Toggle test on and off with data kept. TUDA keeps GIS (`seed:tuda` sets `gis` on); every other tenant loses the GIS UI until it is switched on                                                                                                                                                                               | S    |
| W1  | **Versioning**                 | G17                  | See §5                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | S    |
| W2  | **Documentation set**          | G1, G2, G18, G19     | See §6                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | M    |
| W3  | Enforcement                    | G3–G6, G9, G10       | Copy from Vairiot CI: `check-line-limits.sh`, `check-british-english.mjs`, `.husky/`, `commitlint.config.js`, `.editorconfig`, PR template, `min-release-age=7`, Dependabot `cooldown` and major exclusion; `npm run check`. CI: top-level `permissions: contents: read`, SHA pins, timeouts on every job, `security` job (npm audit high, Semgrep, Trivy, Gitleaks), JUnit + coverage artefacts, Android unit tests, iOS build-and-test job. Line limit: existing over-limit files on a **baseline list** that only shrinks; split them file by file (largest first) | M    |
| W4  | Security controls              | G13–G16              | RLS (D5) with a cross-tenant fuzz suite over every route; audit exports, flag changes and failed sign-ins; make audit writes durable; mandatory 2FA (D6); `USER node` in Dockerfiles, `read_only` + `cap_drop: [ALL]` in prod Compose; `/health/metrics` refused at nginx                                                                                                                                                                                                                                                                                             | L    |
| W5  | Tests and modules              | G11, G12             | Module registry and route guard (D7), nav hiding, admin toggle screen with audit, toggle-matrix test; first admin (Vitest) and reports (pytest) tests; coverage thresholds per D8                                                                                                                                                                                                                                                                                                                                                                                     | L    |
| W6  | Tidy-up                        | G20                  | Remove merged worktrees and branches; merge or close the 22 Dependabot branches (majors via decisions); update `README.md`; move loose files (`Screenshot…png`) out of `docs/`                                                                                                                                                                                                                                                                                                                                                                                        | S    |

Order: W0 and W1a first (hours). W1 and W2 next, together, as Stage 0.9 — they create the stage log and version every later stage relies on. W3 straight after, so every later commit is checked. W4 and W5 run alongside S1–S3 as phase workstreams, each with its own plan entry.

---

## 5. Versioning plan (W1)

**Current state**

| File                                          | Version                        |
| --------------------------------------------- | ------------------------------ |
| `package.json` (root + 5 workspaces)          | `1.0.0` (never bumped)         |
| `vairiot-mobile/app/build.gradle.kts`         | `1.10.1`, code `36`            |
| `vairiot-ios/project.yml` + `project.pbxproj` | `1.10.1`, build `12`           |
| `vairiot-reports`                             | none (`requirements.txt` only) |
| Git tags / `CHANGELOG.md`                     | none                           |

Since 1.10.1 (5 August) both apps gained the S0 offline-queue work and GPS capture without a version change. If any of those builds reached a device or tester, two different builds share `1.10.1 (36)` / `(12)` — check the release tables before choosing the next build numbers.

**Steps**

1. Tag the historical baseline: `git tag -a v1.10.1 <commit after 5ac4c88> -m "Baseline before the standard: mobile 1.10.1 (36/12)"`.
2. Copy `scripts/bump-version.mjs` from Vairiot CI; set its file list to the 6 `package.json` files, `vairiot-reports/pyproject.toml` (new, minimal, version only), `build.gradle.kts` (`versionName`), `project.yml` and `project.pbxproj` (`MARKETING_VERSION`). Add `check:versions` to `npm run check` and the CI static job.
3. Change any internal workspace dependency to `*`.
4. Run `node scripts/bump-version.mjs 2.0.0` (D3); Android `versionCode 37`, iOS build `13` at the next distributed build (build numbers never reset, so they continue across the reset; separate series per §8.3). The iOS OTA and Android update checks compare versions — confirm they treat `2.0.0` as newer than `1.10.1` before release.
5. Write `CHANGELOG.md`: `[2.0.0]` ("adoption of the Managed Development Standard") from the commits since the baseline (S0 hardening, GIS positions, security fixes KFR-037…043, React Router 7, Tailwind 4), and `[1.10.1]` and earlier back-filled from the mobile bump commits (1.7.3 → 1.10.1) and the 22 `release: promote dev to production` merges.
6. Commit `chore(release): 2.0.0`, tag `v2.0.0`, push tags.
7. From then on (§8.1 post-1.0; 2.0.0 is a deliberate reset, not a breaking change): `feat` → minor, `fix`/`perf` → patch, breaking → major; every release to production (`go-live.sh`) bumps and tags; Docker images also tagged with the version on a release tag.

Phase tags: `phase-0-accepted` on owner acceptance of S0 + this audit. Because the MINOR number no longer tracks the phase after 1.0, each stage-log entry records the version it shipped.

---

## 6. Documentation plan (W2)

| File                                        | Source                                                                                                                                               | Status |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `project.md`                                | §16.1 skeleton; objective from TUDA fit-gap; build rules from `docs/sprints/README.md`; brand from `README.md`; phase plan S0–S5; decision log D1–D9 | New    |
| `docs/stage-log.md`                         | Back-fill stages 0.1–0.7 from `S0-summary.md` commits; 0.8 this audit; S1 work so far as 1.0–1.n                                                     | New    |
| `docs/00-discovery-and-architecture.md`     | `AUDIT-2026-07-19.md`, `S0-audit-triage.md`, Vairiot CI `03-reuse-audit.md` findings                                                                 | New    |
| `docs/01-technology-stack.md`               | Package manifests, Dockerfiles, Compose; upgrade policy                                                                                              | New    |
| `docs/02-data-model-and-module-registry.md` | `schema.prisma` (57 models, 15 enums, 38 migrations), feature flags, module registry (D7)                                                            | New    |
| `docs/testing/test-plan.md`                 | Levels, coverage, exit gates per sprint, `REQ-xx` matrix from fit-gap items                                                                          | New    |
| `docs/testing/manual-checks.md`             | Current `docs/TEST-PLAN.md` (manual What/Steps/Pass/Fail checklist) moved here                                                                       | Move   |
| `docs/known-fix-registry.md`                | Keep entries; add a §16.6 index table (KF id, stage, symptom, cause, fix)                                                                            | Amend  |
| `docs/sprints/S0-*.md`                      | Add the §16.4/§16.5 header tables to plan and record, with security and open-point sections                                                          | Amend  |
| `CHANGELOG.md`                              | §5                                                                                                                                                   | New    |
| `docs/word/`                                | Copy `md_to_docx.py` and `vairiot_theme.py` from Vairiot CI; `build_phase0.py` → `Vairiot-AI-Phase-0-Hardening-and-Hosting.docx`                     | New    |
| Package `README.md` ×8                      | How to build, run and test each package                                                                                                              | New    |
| `README.md`                                 | Correct stack versions, branch flow (`dev` → `main` via `go-live.sh`), link to `project.md`                                                          | Amend  |

Not renamed: sprint files keep their names (D1); `DEPLOY.md`, `STAGING-SETUP.md`, `DEV-WORKFLOW.md` stay and are listed in the `project.md` index.

---

## 7. Proposed stages

| Stage | Content                                                                | Version |
| ----- | ---------------------------------------------------------------------- | ------- |
| 0.8   | This audit and plan; D1–D9 decided                                     | —       |
| 0.9   | W0 secrets; W1a GIS behind flag; W1 versioning; W2 documents           | `2.0.0` |
| 0.10  | W3 enforcement and CI                                                  | `2.0.1` |
| —     | Owner accepts Phase 0 → `phase-0-accepted`                             | —       |
| 1.0   | Phase 1 (S1) planned against the standard; W4/W5 items placed in S1–S3 | —       |

## 8. Out of scope for this plan

- i18n and Georgian translation (S3, per D9).
- OpenAPI generated from shared Zod contracts — raise as a decision when S2 adds the import contracts.
- Hash-chained ledger for critical entities — consider with the IPSAS ledger in S2.

## 9. Status after stage 0.9

W0, W1a, W1 and W2 are built (see `docs/stage-log.md` stage 0.9). G7 stays open by owner decision (D4). W3–W6 are not started.

## 10. Open points raised in stage 0.9

| #   | Point                                                                                                                                                                           | Proposed handling                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| G21 | Defect severities S1–S4 (standard §9.6) clash with sprint ids; the test plan uses **Sev1–Sev4**                                                                                 | **Closed** — D10 approved 16 October 2026: Sev1–Sev4 |
| G22 | Sprint files plan versions `2.0.0-pilot` (S3.6), `2.0.1`/`2.1.0` (S4), `2.2.0` (S5), which D3's reset to 2.0.0 overtakes; they also name a `develop` branch that does not exist | Amend the sprint files at stage 1.0: versions follow SemVer from 2.0.0; branch is `dev` |
| G23 | 19 of 57 models have no `tenantId` (children of tenant tables, five platform-global tables, `LoginAttempt`)                                                                     | Design D5 row-level security around this list (`docs/02-…` §2.13) in W4                 |
| G24 | PostGIS runs only in the standalone overlay; production, dev and test use `postgres:16-alpine`; positions are `Float` columns                                                   | Rest of S1.1: switch every compose file to PostGIS before any spatial query             |
| G25 | The S1 sprint file names MapLibre; the code uses Leaflet                                                                                                                        | Record the choice as a decision at stage 1.0                                            |
| G26 | NordicID NUR SDK version and licence are not recorded (local jar/aar)                                                                                                           | Record version and licence as a decision (standard §11.3)                               |

## 11. Status after stage 0.10

W3 is built: line-limit check with a shrink-only baseline (16 files), British English check, Husky pre-commit and commit-msg hooks, Commitlint, `.editorconfig`, pull request template, `npm run check`, seven-day cooling-off in `.npmrc` and Dependabot, majors excluded from Dependabot, and CI with least privilege, SHA-pinned actions, timeouts, a security job, test reports and Android and iOS test jobs. G3–G6, G9 and G10 are closed except where noted below.

| #   | Point                                                                                                                                                                                                                                                         | Proposed handling                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| G27 | Semgrep (OWASP Top Ten) findings that predate stage 0.10: nginx uses `$host` in six places and allows h2c upgrade in two; `res.send` of built bodies in `app.ts`, `platform.router.ts`, `ios.router.ts`, `reports.router.ts`; GCM decryption without `authTagLength` in the API and worker `crypto.ts`; Dockerfiles without `USER` (G16); the exported launcher activity (false positive) | Triage and fix in W4. CI fails only on new findings (`--baseline-commit`)               |
| G28 | 315 of 334 TypeScript sources are not Prettier-formatted, so the pre-commit hook runs ESLint only; formatting the codebase would touch almost every file                                                                                                    | One formatting-only commit at a quiet point (no open branches), then add Prettier to lint-staged and CI |
| G29 | The iOS workflow targets the `macos-26` runner image and picks the first available iPhone simulator; not yet run on GitHub                                                                                                                                   | Check the first run; adjust the runner label if the image is not available              |

## 12. Status after stage 1.6

G20 is closed: merged branches and stale worktrees removed (stage 1.6). Dependabot branches (20) are handled in W6.

## 13. Open points raised in Phase 1

| #   | Point                                                                                                     | Proposed handling                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| G30 | No browser end-to-end tests: Playwright is in the standard (§9.1) and the S1.4 gate, but not in the repo | Raise as a decision with the e2e suite: Playwright against the mocked API first, then the Docker stack |
| G31 | No Content-Security-Policy on the web console or API                                                      | Add a CSP in W6 (security); it must allow the tenant's tile host from `mapSettings`                |
| G32 | MinIO still runs as root: existing servers keep its data in root-owned host directories                  | A one-off `chown` of `infra/data/minio` per server, then `USER` in `infra/minio/Dockerfile`; until then it is skipped by Trivy and annotated for Semgrep |

Status after stage 1.17: G27 closed (Semgrep clean on the OWASP Top Ten rules); G16 closed except MinIO (G32).

Status after stage 1.19: G13 partly closed (row-level security on `assets`, `audit_events` and `photos`; the other tenant tables follow table by table, see G23); G15 closed (two-factor mandatory for administrators, D6); G16 closed except MinIO (G32).

