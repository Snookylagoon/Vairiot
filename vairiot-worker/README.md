# vairiot-worker

| Item     | Detail                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------- |
| Package  | `vairiot-worker` — background jobs for Vairiot Asset Intelligence                              |
| Stack    | Node 24, BullMQ 6 on Redis 7, Prisma 7, nodemailer and Resend                                  |
| Revision | 0.1 (16 October 2026)                                                                          |
| See also | [Technology stack](../docs/01-technology-stack.md) · [Test plan](../docs/testing/test-plan.md) |

The API puts jobs on Redis queues; the worker does them. It publishes no port.

## Processors

| File                                   | Job                                                                |
| -------------------------------------- | ------------------------------------------------------------------ |
| `processors/user-invite.ts`            | Sends invitation e-mails                                           |
| `processors/audit-complete.ts`         | Audit completion e-mail with a CSV                                 |
| `processors/notification-scheduler.ts` | Repeatable schedules for digests and maintenance-due notices       |
| `processors/alert-digest.ts`           | Daily and weekly alert digests (`ALERT_DIGEST_*_CRON` to override) |
| `processors/storage-metering.ts`       | Nightly `TenantUsage` snapshot                                     |
| `processors/webhook-deliver.ts`        | HMAC-signed webhook delivery with retries and a delivery log       |
| `job-alerts.ts`                        | Throttled e-mail to `OPS_ALERT_EMAIL` when a job fails for good    |

Sentry reports errors when `SENTRY_DSN` is set; otherwise it is a no-op.

## Set up

```bash
npm install                    # from the repository root; runs prisma generate for the API schema
```

The worker needs `DATABASE_URL`, `REDIS_URL`, MinIO and mail settings from `.env` (see `.env.example`).

## Run

| Task                | Command (from the repository root)                                  |
| ------------------- | ------------------------------------------------------------------- |
| Development (watch) | `npm run dev --workspace vairiot-worker` (`tsx watch src/index.ts`) |
| Build               | `npm run build --workspace vairiot-worker` (`tsc`)                  |
| Start the build     | `npm start --workspace vairiot-worker`                              |
| Type-check          | `npm run typecheck --workspace vairiot-worker`                      |

In Docker the worker runs as the `worker` service of `infra/docker-compose.yml` or `docker-compose.prod.yml`.

## Test

| Task     | Command                                        |
| -------- | ---------------------------------------------- |
| Run once | `npm test --workspace vairiot-worker` (`jest`) |

One suite today (`src/__tests__/job-alerts.test.ts`), run in CI. Jest and ts-jest come from the root install. Decision D8 sets 60 % lines by the end of S2 and 80 % by S4; the processors need suites of their own.
