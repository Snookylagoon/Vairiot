# Technology Stack

| Item                | Detail                                                                                                                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Product             | Vairiot Asset Intelligence                                                                                                                                                                                                                                                     |
| Phase               | 0 — stage 0.9 (documentation set, W2)                                                                                                                                                                                                                                          |
| Status              | Draft — versions read from the repository on 16 October 2026                                                                                                                                                                                                                   |
| Revision            | 0.1 (16 October 2026)                                                                                                                                                                                                                                                          |
| Date                | 16 October 2026                                                                                                                                                                                                                                                                |
| Sources             | Every `package.json` and `package-lock.json`; `vairiot-reports/requirements.txt`; `scripts/requirements.txt`; `vairiot-mobile/gradle/libs.versions.toml` and `app/build.gradle.kts`; `vairiot-ios/project.yml`; Dockerfiles; `infra/docker-compose*.yml`; `.github/workflows/` |
| Companion documents | [00 Discovery and architecture](00-discovery-and-architecture.md) · [02 Data model and module registry](02-data-model-and-module-registry.md) · [Test plan](testing/test-plan.md)                                                                                              |

---

**How to read the version columns.** "Declared" is what the manifest asks for. "Resolved" is what `package-lock.json` installs today. Where the manifest pins exactly (Python, Gradle), there is only one value. Product versions themselves are covered by decision D3 (lockstep reset to `2.0.0`) and are not repeated here.

## 1. Runtimes and languages

| Component   | Version                               | Where set                                                                     | Rationale                                                                    |
| ----------- | ------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Node.js     | 24 LTS (`>=24.0.0`)                   | Root `engines`; `node:24-alpine` in every Node image; CI `node-version: '24'` | Same major everywhere since INF-10; Node 22 leaves maintenance in April 2027 |
| npm         | `>=10.0.0`                            | Root `engines`                                                                | Workspaces and `overrides`                                                   |
| TypeScript  | `^5.4.0` → 5.9.3                      | Root and every workspace                                                      | Strict typing across API, web, admin, worker, shared                         |
| Python      | 3.12                                  | `python:3.12-slim` (reports); CI `setup-python` 3.12                          | Report rendering libraries; register profiler                                |
| Kotlin      | 2.2.10                                | `libs.versions.toml`                                                          | Android app                                                                  |
| Java target | 11 (`jvmTarget = "11"`); JDK 21 in CI | `app/build.gradle.kts`; `android.yml`                                         | Bytecode level accepted by AGP 8.10                                          |
| Swift       | 5.9                                   | `project.yml` `SWIFT_VERSION`                                                 | iOS app; Xcode 15 project format (`xcodeVersion: "15.0"`)                    |
| Go          | 1.24 (build stage only)               | `infra/minio/Dockerfile`                                                      | Builds MinIO and `mc` from source (INF-15)                                   |

## 2. Back end — `vairiot-api` and `vairiot-worker`

| Component                 | Declared   | Resolved | Package         | Rationale                                                                          |
| ------------------------- | ---------- | -------- | --------------- | ---------------------------------------------------------------------------------- |
| Express                   | `^5.2.1`   | 5.2.1    | api             | Mature HTTP framework; async error handling in v5                                  |
| Prisma / `@prisma/client` | `^7.10.0`  | 7.10.0   | api, worker     | Typed schema and migrations; v7 removed the Node version mismatch                  |
| `@prisma/adapter-pg`      | `^7.10.0`  | 7.10.0   | api, worker     | Driver adapter for `pg`                                                            |
| BullMQ                    | `^6.3.1`   | 6.3.11   | api, worker     | Durable jobs with retries on Redis                                                 |
| ioredis                   | `^6.0.0`   | 6.0.0    | api, worker     | Redis client for queues, limits, blacklist                                         |
| Zod                       | `^3.23.0`  | 3.25.76  | api, shared     | Schema validation (flags, shared contracts). A hoisted 4.6.5 serves other packages |
| express-validator         | `^7.1.0`   | 7.3.2    | api             | Per-route validation (most routes; COM-2)                                          |
| jsonwebtoken              | `^9.0.2`   | 9.0.3    | api             | Access, refresh, setup and challenge tokens                                        |
| bcryptjs                  | `^3.0.3`   | 3.0.3    | api             | Password hashing (cost 12)                                                         |
| otplib                    | `^13.4.1`  | 13.5.0   | api             | TOTP two-factor                                                                    |
| qrcode                    | `^1.5.4`   | 1.5.4    | api, web, admin | 2FA enrolment and label codes                                                      |
| helmet                    | `^8.3.0`   | 8.3.0    | api             | Security headers                                                                   |
| cors                      | `^2.8.5`   | 2.8.6    | api             | Origin allowlist                                                                   |
| compression               | `^1.8.2`   | 1.8.2    | api             | gzip for standalone installs without the production nginx (COM-1)                  |
| express-rate-limit        | `^8.5.2`   | 8.7.1    | api             | Global and per-user sync limits                                                    |
| rate-limit-redis          | `^6.0.0`   | 6.0.1    | api             | Limits shared across API replicas                                                  |
| multer                    | `^2.2.0`   | 2.4.0    | api             | Multipart uploads                                                                  |
| minio                     | `^8.0.7`   | 8.0.7    | api             | S3-compatible object storage client                                                |
| nodemailer                | `^10.0.15` | 10.0.15  | api, worker     | SMTP e-mail (SEC-H1 fixed)                                                         |
| resend                    | `^6.14.0`  | 6.32.0   | api, worker     | Alternative e-mail provider                                                        |
| axios                     | `^1.18.0`  | 1.20.0   | api             | Calls to the reports service                                                       |
| swagger-ui-express        | `^5.0.1`   | 5.0.1    | api             | Serves the hand-written OpenAPI at `/api/docs`                                     |
| winston                   | `^3.13.0`  | 3.19.0   | api, worker     | Structured logs                                                                    |
| morgan                    | `^1.10.0`  | 1.12.1   | api             | Request logs                                                                       |
| `@sentry/node`            | `^10.66.0` | 10.76.0  | api, worker     | Error tracking (no-op without `SENTRY_DSN`)                                        |
| tsx                       | `^4.15.0`  | 4.23.15  | api, worker     | Development runner and seeds                                                       |

## 3. Web and admin — `vairiot-web`, `vairiot-admin`

| Component              | Declared  | Resolved | Package    | Rationale                                                                       |
| ---------------------- | --------- | -------- | ---------- | ------------------------------------------------------------------------------- |
| React, React DOM       | `^19.2.0` | 19.3.0   | web, admin | Pinned to 19 by a root `overrides` entry (two-React trap, see `vite.config.ts`) |
| React Router           | `^7.18.4` | 7.18.4   | web, admin | Routing                                                                         |
| Vite                   | `^8.2.1`  | 8.3.3    | web, admin | Build and dev server (web 3000, admin 3002; `/api` proxied to 3001)             |
| `@vitejs/plugin-react` | `^6.0.5`  | 6.1.2    | web, admin | React transform                                                                 |
| Tailwind CSS           | `^4.3.3`  | 4.3.3    | web, admin | Utility CSS through `@tailwindcss/postcss`                                      |
| PostCSS                | `^8.4.0`  | 8.5.29   | web, admin | Tailwind pipeline                                                               |
| TanStack Query         | `^5.45.0` | 5.104.1  | web, admin | Server state and caching                                                        |
| Zustand                | `^4.5.0`  | 4.5.7    | web, admin | Auth store                                                                      |
| React Hook Form        | `^7.85.0` | 7.89.0   | web, admin | Forms                                                                           |
| `@hookform/resolvers`  | `^5.4.0`  | 5.9.1    | web, admin | Zod resolver                                                                    |
| axios                  | `^1.7.0`  | 1.20.0   | web, admin | API client                                                                      |
| Leaflet                | `^1.9.4`  | 1.9.4    | web        | Asset map (GIS position work)                                                   |
| react-leaflet          | `^5.0.0`  | 5.0.0    | web        | React bindings for Leaflet                                                      |
| leaflet.markercluster  | `^1.5.3`  | 1.5.3    | web        | Marker clustering                                                               |
| Recharts               | `^3.8.1`  | 3.10.1   | web, admin | Dashboard charts                                                                |
| lucide-react           | `^1.39.0` | 1.52.0   | web, admin | Icons                                                                           |
| sonner                 | `^2.0.7`  | 2.0.8    | web, admin | Toasts                                                                          |
| bwip-js                | `^4.11.1` | 4.11.4   | web        | Barcodes on labels                                                              |
| clsx                   | `^2.1.0`  | 2.1.1    | web, admin | Class names                                                                     |
| `@sentry/react`        | `^11.4.0` | 11.4.0   | web        | Browser error tracking (`VITE_SENTRY_DSN`)                                      |

The S1 sprint file names MapLibre GL JS for the map. The code uses **Leaflet**; any change of map engine is a major decision for the log.

## 4. Shared — `vairiot-shared`

| Component  | Declared  | Resolved | Rationale                                                      |
| ---------- | --------- | -------- | -------------------------------------------------------------- |
| Zod        | `^3.23.0` | 3.25.76  | Shared contracts (auth today), geo validation                  |
| TypeScript | `^5.4.0`  | 5.9.3    | Built to ESM `dist/`; the API's Jest maps it to source instead |

## 5. Reports — `vairiot-reports`

All pinned exactly in `requirements.txt`.

| Component         | Version                   | Rationale                          |
| ----------------- | ------------------------- | ---------------------------------- |
| FastAPI           | 0.139.2                   | `POST /generate`, `GET /health`    |
| uvicorn[standard] | 0.30.6                    | ASGI server on port 8100           |
| pydantic          | 2.13.4                    | Request models                     |
| ReportLab         | 4.2.5                     | PDF output                         |
| python-docx       | 1.1.2                     | DOCX output                        |
| openpyxl          | 3.1.5                     | XLSX output                        |
| Pillow            | 12.3.0                    | Images in reports                  |
| fonts-montserrat  | Debian package (unpinned) | Brand font for every output format |

`scripts/requirements.txt` (register profiler) uses ranges, `pandas>=2.2` and `openpyxl>=3.1`; the standard asks for exact pins (W3).

## 6. Android — `vairiot-mobile`

| Component                    | Version                                                                                     | Rationale                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Gradle wrapper               | 8.14                                                                                        | Build                                                            |
| Android Gradle Plugin        | 8.10.1                                                                                      | Build                                                            |
| KSP                          | 2.2.10-2.0.2                                                                                | Room and Hilt code generation                                    |
| SDK levels                   | compile 36, target 36, min 29                                                               | Meferi ME61/65/74 run Android 13                                 |
| Compose BOM                  | 2026.06.01                                                                                  | UI (Material 3, UI, tooling)                                     |
| Activity Compose             | 1.13.0                                                                                      | Compose host                                                     |
| Navigation Compose           | 2.9.0                                                                                       | Screen navigation                                                |
| Lifecycle (runtime, compose) | 2.8.0                                                                                       | View models                                                      |
| core-ktx                     | 1.18.0                                                                                      | Kotlin extensions                                                |
| Hilt                         | 2.56; hilt-navigation 1.2.0; hilt-work 1.2.0                                                | Dependency injection                                             |
| Room                         | 2.8.4                                                                                       | Offline queues and cache (schema version 8, explicit migrations) |
| WorkManager                  | 2.9.1                                                                                       | Background sync that survives reboot                             |
| Retrofit (+ Gson converter)  | 2.11.0                                                                                      | API client                                                       |
| OkHttp (+ logging)           | 4.12.0                                                                                      | HTTP                                                             |
| DataStore Preferences        | 1.1.1                                                                                       | Tokens and settings (unencrypted; SEC-L3)                        |
| Coroutines                   | 1.8.1                                                                                       | Concurrency                                                      |
| Coil Compose                 | 2.7.0                                                                                       | Image loading                                                    |
| Material icons extended      | 1.7.8                                                                                       | Icons                                                            |
| ExifInterface                | 1.4.1                                                                                       | Photo orientation and metadata                                   |
| CameraX                      | 1.4.2                                                                                       | Camera scanning and photos                                       |
| ML Kit barcode scanning      | 17.3.0                                                                                      | Camera barcode decoding                                          |
| ZXing core                   | 3.5.3                                                                                       | Barcode generation and decoding                                  |
| Nordic BLE scanner           | 1.6.0                                                                                       | Bluetooth reader discovery                                       |
| NordicID NUR SDK             | Local `NurApi.jar`, `NurApiAndroid.aar`, `TDTLib.jar` in `app/libs/` (version not recorded) | UHF RFID readers                                                 |
| JUnit                        | 4.13.2; AndroidX JUnit 1.3.0; Espresso 3.7.0                                                | Unit and instrumented tests                                      |

## 7. iOS — `vairiot-ios`

| Component          | Version                                                                                                                         | Rationale                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Deployment target  | iOS 17.0                                                                                                                        | SwiftData and Observation                         |
| Project generation | XcodeGen `project.yml` (tool version not pinned)                                                                                | The `.xcodeproj` is generated; edit `project.yml` |
| Frameworks         | Apple only: SwiftUI, SwiftData, AVFoundation, CoreLocation, MapKit, CoreBluetooth, BackgroundTasks, Network, PhotosUI, Security | No third-party packages                           |
| Tests              | XCTest target `VairiotMobileTests`                                                                                              | Sync, queues, delta sync, GPS position            |
| Distribution       | Ad Hoc IPA (`scripts/build-adhoc.sh`) published through `IosRelease`                                                            | Enterprise sideloading                            |

## 8. Data stores and infrastructure images

| Component    | Image or version                                                                                                                                | Where                                        | Rationale                                            |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------- |
| PostgreSQL   | `postgres:16-alpine` (tag floats)                                                                                                               | dev, infra, prod, test, restore-test compose | System of record                                     |
| PostGIS      | `postgis/postgis:16-3.4` (override `POSTGIS_IMAGE`)                                                                                             | `docker-compose.standalone.yml` only         | Planned for GIS work; the schema does not use it yet |
| Redis        | `redis:7-alpine` (tag floats)                                                                                                                   | All compose files                            | Queues, rate limits, blacklist                       |
| MinIO        | `vairiot-minio:RELEASE.2025-10-15T17-29-55Z`, built from source at commit `9e49d5e`; `mc` `RELEASE.2025-08-13T08-35-41Z`; runtime `alpine:3.22` | `infra/minio/Dockerfile`                     | Official images can no longer be pulled (INF-15)     |
| nginx        | `nginx:alpine` (tag floats)                                                                                                                     | Reverse proxy; web and admin runtime stage   | TLS, routing, static SPAs                            |
| Node images  | `node:24-alpine`                                                                                                                                | api, worker, web and admin build stages      | One runtime                                          |
| Python image | `python:3.12-slim`                                                                                                                              | reports                                      | Report libraries                                     |
| Backups      | `pg_dump -Fc`, `mc mirror`, Redis snapshot, `age`, `rclone`                                                                                     | `infra/backup.sh`, `restore-test.sh`         | Encrypted, off-site, 30 daily + 12 monthly           |

Floating tags for Postgres, Redis and nginx are open point INF-9: pinning waits until the tags running on the server are known.

## 9. Code quality and testing tools

| Tool                      | Declared         | Resolved | Use                                            |
| ------------------------- | ---------------- | -------- | ---------------------------------------------- |
| ESLint                    | `^9.39.0`        | 9.39.5   | Flat config at the root (`eslint.config.js`)   |
| typescript-eslint         | `^8.68.0`        | 8.71.1   | TypeScript rules                               |
| eslint-plugin-react       | `^7.37.5`        | 7.37.5   | React rules                                    |
| eslint-plugin-react-hooks | `^7.1.1`         | 7.1.1    | Hooks rules                                    |
| eslint-plugin-import      | `^2.32.0`        | 2.32.0   | Import rules                                   |
| eslint-config-prettier    | `^10.1.8`        | 10.1.8   | Turns off rules Prettier owns                  |
| Prettier                  | `^3.2.0`         | 3.9.9    | Formatting (`npm run format`)                  |
| Jest                      | `^30.5.1`        | 30.5.2   | API, worker, shared unit and integration tests |
| ts-jest                   | `^29.4.12`       | 29.4.14  | TypeScript in Jest                             |
| Supertest                 | `^7.0.0`         | 7.3.1    | API integration tests                          |
| Vitest                    | `^4.1.10`        | 4.1.11   | Web component and unit tests                   |
| Testing Library (React)   | `^16.0.0`        | 16.3.3   | Web component tests                            |
| jsdom                     | `^30.0.1`        | 30.1.2   | Browser environment for Vitest                 |
| Python `unittest`         | standard library | —        | Register profiler tests (`scripts/tests`)      |

Not yet present (planned in W3 and W5): Husky, Commitlint, a line-limit and British English check, Playwright, pytest for reports, Vitest in admin, Semgrep, Trivy, Gitleaks in CI.

## 10. CI actions

All pinned **by tag**, not by commit SHA (G10).

| Action                          | Tag | Workflow                |
| ------------------------------- | --- | ----------------------- |
| `actions/checkout`              | v7  | `ci.yml`, `android.yml` |
| `actions/setup-node`            | v4  | `ci.yml`                |
| `actions/setup-python`          | v5  | `ci.yml`                |
| `actions/setup-java`            | v4  | `android.yml`           |
| `android-actions/setup-android` | v4  | `android.yml`           |
| `actions/cache`                 | v4  | `android.yml`           |
| `actions/upload-artifact`       | v4  | `android.yml`           |
| `docker/setup-buildx-action`    | v3  | `ci.yml`                |
| `docker/login-action`           | v3  | `ci.yml`                |
| `docker/build-push-action`      | v7  | `ci.yml`                |

## 11. Upgrade policy

This follows the standard §11.3–11.4.

| Rule                           | Policy                                                                                                                                                                                                   | Today                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Lock files                     | `package-lock.json` committed; installs with `npm ci` only                                                                                                                                               | Met                                                                 |
| Seven-day cooling-off          | No version is installed until it is at least seven days old: `.npmrc` `min-release-age=7`; Dependabot `cooldown: default-days: 7`; Python and Gradle versions pinned exactly and at least seven days old | `.npmrc` has retries only; Dependabot has no cooldown (W3)          |
| Minor and patch                | Dependabot weekly for npm, pip, Gradle, GitHub Actions and Docker; minor and patch grouped and merged on a green pipeline                                                                                | Dependabot runs; 22 branches open (W6)                              |
| Major versions                 | **Only through the decision log**: a numbered decision with options and a recommendation, owner approval, and a stage of its own                                                                         | Dependabot does not exclude majors yet (W3)                         |
| Vulnerable transitive packages | Fixed with root `overrides`, each recorded in the stage log                                                                                                                                              | `overrides` used for `deepmerge-ts`, `mysql2`, `react`, `react-dom` |
| Security checks                | `npm audit --audit-level=high`, Semgrep, Trivy and Gitleaks in CI; findings fixed before merge                                                                                                           | `npm audit` 0 high (4 moderate); no security job (W3)               |
| Actions and images             | Actions pinned by SHA with the version in a comment; base images pinned; source-built images (MinIO) pinned to tag and commit                                                                            | MinIO met; actions and three images not pinned                      |
| Third-party SDK licences       | Read and accepted by the owner, recorded as a decision with the version installed                                                                                                                        | NordicID NUR SDK version and licence not recorded                   |
