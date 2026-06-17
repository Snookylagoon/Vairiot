# Vairiot Enhanced Asset Management

**RFID & IoT Solutions** — Production-grade fixed asset management platform with native Meferi device integration.

> Repository: https://github.com/Snookylagoon/Vairiot.git  
> Status: Sprint 1 — Foundation  
> Classification: Confidential — Internal Use Only

---

## What This Is

Vairiot is a full-stack enterprise asset management platform that operates in three modes:

| Mode | Description |
|---|---|
| **Standalone** | Self-hosted on client premises. No internet required. Single tenant. |
| **SaaS** | Cloud-hosted by Vairiot. Multi-tenant. Per-seat subscription. |
| **Hybrid** | Local-first with cloud sync for reporting, backup, and multi-site consolidation. |

All three modes use the same codebase. Deployment mode is a configuration concern, not a code branch.

---

## Repository Structure

```
Vairiot/
├── vairiot-api/        Node.js / Express / Prisma — REST API & business logic
├── vairiot-web/        React 18 / Vite / Tailwind — Web application
├── vairiot-mobile/     Kotlin / Jetpack Compose / Meferi EDK — Android app
├── vairiot-worker/     Node.js / BullMQ — Background jobs
├── vairiot-shared/     Shared TypeScript types and Zod schemas
├── infra/              Docker Compose, Nginx config
├── docs/               Architecture decisions, API docs, Known-Fix Registry
├── scripts/            Database seed, migration helpers
└── .github/workflows/  GitHub Actions CI/CD
```

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 22 LTS | nodejs.org |
| Docker Desktop | 29+ | docker.com |
| Git | 2.50+ | git-scm.com |
| Android Studio | Latest | developer.android.com/studio |

---

## Local Development Setup

**Step 1 — Clone and scaffold** (already done if you are reading this):
```bash
cd /Volumes/DRSssd/Projects/GitHub
git clone https://github.com/Snookylagoon/Vairiot.git
cd Vairiot
```

**Step 2 — Copy environment variables:**
```bash
cp .env.example .env
# Edit .env and set your local values
```

**Step 3 — Install dependencies:**
```bash
npm install
```

**Step 4 — Start the full dev stack:**
```bash
cd infra
docker compose up
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

| Token | Value |
|---|---|
| Gradient | `#FF0DCC → #A05B97 → #615AA0` (left to right) |
| Pink | `#FF0DCC` — Pantone 807C |
| Mauve | `#A05B97` — gradient midpoint |
| Violet | `#615AA0` — gradient end |
| Charcoal | `#2B3132` — Pantone 533C |
| Font (sans) | Montserrat |
| Font (mono) | IBM Plex Mono |

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

1. Create a feature branch: `git checkout -b feature/your-feature-name`
2. Make changes, ensuring `npm run lint` and `npm test` both pass
3. Open a pull request against `develop`
4. All CI checks must be green before merge
5. Add any new bugs fixed to `docs/known-fix-registry.md`
