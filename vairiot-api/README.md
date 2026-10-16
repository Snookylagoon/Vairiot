# vairiot-api

| Item     | Detail                                                                                                                                                      |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package  | `vairiot-api` — REST API of Vairiot Asset Intelligence                                                                                                      |
| Stack    | Node 24, Express 5, Prisma 7 on PostgreSQL 16, BullMQ on Redis 7, MinIO                                                                                     |
| Revision | 0.1 (16 October 2026)                                                                                                                                       |
| See also | [Technology stack](../docs/01-technology-stack.md) · [Data model](../docs/02-data-model-and-module-registry.md) · [Test plan](../docs/testing/test-plan.md) |

The API serves `/api/v1` to the web console, the admin console and both mobile apps. OpenAPI is at `/api/docs`; health at `/health` and `/health/ready`.

## Layout

| Path                             | Contents                                                                   |
| -------------------------------- | -------------------------------------------------------------------------- |
| `src/app.ts`                     | Middleware order and router mounts (public, onboarding, gated)             |
| `src/routes/`                    | One folder per area, `*.router.ts` with express-validator rules            |
| `src/services/`                  | Business logic; every query filters by `tenantId`                          |
| `src/middleware/`                | `authenticate`, `authorise`, scope, licence, rate-limit, `require-feature` |
| `src/lib/`                       | Prisma client, JWT, crypto, MinIO, queues, OpenAPI, feature flags          |
| `src/__tests__/`                 | Jest suites (integration-heavy)                                            |
| `prisma/schema.prisma`           | 57 models; `prisma/migrations/` holds every migration                      |
| `prisma/seed.ts`, `seed-tuda.ts` | Demo seed and the TUDA tenant seed                                         |

## Set up

From the repository root:

```bash
npm install                    # also runs `prisma generate` (postinstall)
bash scripts/dev-setup.sh      # writes a local .env with generated secrets
npm run build --workspace vairiot-shared
```

The API needs PostgreSQL, Redis and MinIO. Start them with `docker compose -f infra/docker-compose.infra.yml up -d`, or run the whole stack with `npm run dev` (`infra/docker-compose.yml`). Every variable is documented in `.env.example`.

## Run

| Task                           | Command (from the repository root)                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| Development server (port 3001) | `npm run dev:api` (`tsx watch src/index.ts`)                                                |
| Build                          | `npm run build --workspace vairiot-api` (`tsc`)                                             |
| Start the build                | `npm start --workspace vairiot-api` (`node dist/index.js`)                                  |
| Type-check                     | `npm run typecheck --workspace vairiot-api`                                                 |
| New migration (development)    | `npm run db:migrate` (`prisma migrate dev`)                                                 |
| Apply migrations               | `npm run db:deploy --workspace vairiot-api`                                                 |
| Prisma Studio                  | `npm run db:studio`                                                                         |
| Demo seed                      | `npm run db:seed --workspace vairiot-api`                                                   |
| TUDA tenant seed               | `TUDA_ADMIN_EMAIL=… npm run seed:tuda --workspace vairiot-api` (prints the invitation link) |

Schema changes always go through a Prisma migration. Never edit a database by hand.

## Test

| Task                             | Command                                         |
| -------------------------------- | ----------------------------------------------- |
| Whole suite on a throwaway stack | `npm run test:api` (runs `scripts/test-api.sh`) |
| Only paths matching a word       | `./scripts/test-api.sh auth`                    |
| Keep the stack up afterwards     | `KEEP_UP=1 ./scripts/test-api.sh`               |

`scripts/test-api.sh` starts Postgres and Redis from `infra/docker-compose.test.yml` (ports 55432 and 56379, data in tmpfs), applies migrations, runs Jest in band and tears everything down. Docker must be running.

Do not run bare `npm test --workspace vairiot-api` against a database you care about: the suite seeds and deletes tenants. It refuses any database that is not a local `*_test` database.

Coverage gate: 50 % lines (`jest.config.js`), rising under decision D8. Every new route needs an OpenAPI entry, validation rules, a Jest test and a tenancy test (another tenant's id gives 404).

## Rules

- Read `docs/known-fix-registry.md` before changing code; add every non-trivial fix to it.
- A switchable module's routes use `requireFeature('<flag>')` and answer 404 when the flag is off.
- At most 500 lines per file. `report-export.service.ts`, `platform-admin.service.ts`, `audit.service.ts`, `asset.service.ts` and `lib/openapi.ts` are over and are being split (W3).
