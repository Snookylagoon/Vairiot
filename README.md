# Vairiot Enhanced Asset Management

**RFID & IoT Solutions** — Production-grade fixed asset management platform with native Meferi device integration.

> Repository: https://github.com/Snookylagoon/Vairiot.git  
> Status: version 2.0.0 — Phase 0 (S0) built, Phase 1 (S1, GIS) in progress. See [project.md](project.md)  
> Classification: Confidential — Internal Use Only

---

## What This Is

Vairiot is a full-stack enterprise asset management platform that operates in three modes:

| Mode           | Description                                                                      |
| -------------- | -------------------------------------------------------------------------------- |
| **Standalone** | Self-hosted on client premises. No internet required. Single tenant.             |
| **SaaS**       | Cloud-hosted by Vairiot. Multi-tenant. Per-seat subscription.                    |
| **Hybrid**     | Local-first with cloud sync for reporting, backup, and multi-site consolidation. |

All three modes use the same codebase. Deployment mode is a configuration concern, not a code branch.

---

## Repository Structure

```
Vairiot/
├── vairiot-api/        Node.js / Express / Prisma — REST API & business logic
├── vairiot-web/        React 19 / Vite / Tailwind 4 — Web application
├── vairiot-admin/      React 19 / Vite / Tailwind 4 — Platform administration console
├── vairiot-mobile/     Kotlin / Jetpack Compose / Meferi EDK — Android app
├── vairiot-ios/        SwiftUI / SwiftData / XcodeGen — iOS app
├── vairiot-reports/    Python / FastAPI — report service
├── vairiot-worker/     Node.js / BullMQ — Background jobs
├── vairiot-shared/     Shared TypeScript types and Zod schemas
├── infra/              Docker Compose, Nginx config
├── docs/               Stage log, foundation documents, test plan, sprints, Known-Fix Registry
├── scripts/            Database seed, migration helpers
└── .github/workflows/  GitHub Actions CI/CD
```

---

## Prerequisites

| Tool           | Version | Install                      |
| -------------- | ------- | ---------------------------- |
| Node.js        | 24 LTS  | nodejs.org                   |
| Docker Desktop | 29+     | docker.com                   |
| Git            | 2.50+   | git-scm.com                  |
| Android Studio | Latest  | developer.android.com/studio |

---

## Local Development Setup

**Step 1 — Clone and scaffold** (already done if you are reading this):

```bash
cd /Volumes/DRSssd/Projects/GitHub
git clone https://github.com/Snookylagoon/Vairiot.git
cd Vairiot
```

**Step 2 — Generate local secrets:**

```bash
bash scripts/dev-setup.sh
# Writes .env from .env.example with fresh random values; prints none of them
```

**Step 3 — Install dependencies:**

```bash
npm install
```

**Step 4 — Start the full dev stack:**

```bash
docker compose --env-file .env -f infra/docker-compose.yml up
```

This starts: PostgreSQL, Redis, MinIO, API, Web app, Worker, and Nginx.

**Step 5 — Run database migrations:**

```bash
npm run db:migrate
```

**Step 6 — Open the app:**

- Web app: http://localhost (via Nginx)
- API: http://localhost/api
- MinIO console: http://localhost:9001
- Direct web dev server: http://localhost:3000

---

## Android (Meferi Device)

The Android app targets Meferi ME61 / ME65 / ME74 / ME40K running Android 13.

1. Open `vairiot-mobile/` in Android Studio
2. Add Montserrat font TTF files to `app/src/main/res/font/`
   (Download from fonts.google.com/specimen/Montserrat)
3. Connect a physical Meferi device via USB
4. Run the app — the Meferi EDK is a system-level API on the device, no additional SDK setup required

**For emulator / unit testing:** `MockScannerService` is provided and requires no hardware.

---

## Brand Design System

| Token       | Value                                         |
| ----------- | --------------------------------------------- |
| Gradient    | `#FF0DCC → #A05B97 → #615AA0` (left to right) |
| Pink        | `#FF0DCC` — Pantone 807C                      |
| Mauve       | `#A05B97` — gradient midpoint                 |
| Violet      | `#615AA0` — gradient end                      |
| Charcoal    | `#2B3132` — Pantone 533C                      |
| Font (sans) | Montserrat                                    |
| Font (mono) | IBM Plex Mono                                 |

CSS: `linear-gradient(90deg, #FF0DCC 0%, #A05B97 50%, #615AA0 100%)`

---

## Running Tests

```bash
# All tests
npm test

# API tests only
npm test --workspace=vairiot-api

# Web tests only
npm test --workspace=vairiot-web

# Android unit tests
cd vairiot-mobile && ./gradlew testDebugUnitTest
```

---

## Known-Fix Registry

Before implementing any new module, read `docs/known-fix-registry.md`.
This records every bug found and fixed during development so problems are never solved twice.

---

## Contributing

Work follows the Managed Development Standard; the rules are in [project.md](project.md) §2.

1. Branch from `dev`: `git checkout -b feat/your-change dev`
2. Commit with conventional messages: `feat(api): …`, `fix(web): …`, `docs(phase-1): …`
3. Make sure `npm run lint`, `npm test` and `npm run check:versions` pass
4. Open a pull request against `dev`; CI must be green before merge
5. `scripts/go-live.sh` promotes `dev` to `main` (production) through a checked pull request
6. Add every non-trivial fix to `docs/known-fix-registry.md`, a stage-log entry to `docs/stage-log.md`, and a line to `CHANGELOG.md`
7. Releases bump every version file at once: `npm run version:set -- 2.0.1`
