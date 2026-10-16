# vairiot-admin

| Item     | Detail                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------- |
| Package  | `vairiot-admin` — platform administration console                                              |
| Stack    | React 19, Vite 8, Tailwind 4, React Router 7, TanStack Query, Zustand                          |
| Revision | 0.1 (16 October 2026)                                                                          |
| See also | [Technology stack](../docs/01-technology-stack.md) · [Test plan](../docs/testing/test-plan.md) |

Used by platform administrators, not tenants: tenants, licences, users, SMTP, the audit log, and Android and iOS releases. Served at `vaiadmin.vairiot.com` (staging `testadmin.vairiot.com`). It calls the same API as the web console; platform-admin routes are guarded by role.

## Layout

| Path                                    | Contents                                                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `src/pages/`                            | `tenants`, `licences`, `users`, `smtp`, `audit-log`, `mobile-releases`, `ios-releases`, `dashboard`, `profile`, `auth` |
| `src/components/`                       | Shared UI and layout                                                                                                   |
| `src/hooks/`, `src/stores/`, `src/lib/` | Query hooks, auth store, API client                                                                                    |

## Set up

```bash
npm install                                  # from the repository root
npm run build --workspace vairiot-shared
```

The development server proxies `/api` to `http://localhost:3001`; run the API with `npm run dev:api`.

## Run

| Task                           | Command (from the repository root)                              |
| ------------------------------ | --------------------------------------------------------------- |
| Development server (port 3002) | `npm run dev:admin` (set `PORT` to change it)                   |
| Build                          | `npm run build --workspace vairiot-admin` (`tsc && vite build`) |
| Preview the build              | `npm run preview --workspace vairiot-admin`                     |
| Type-check                     | `npm run typecheck --workspace vairiot-admin`                   |

## Test

There are **no tests and no `test` script yet**. Type-checking runs in CI. The first Vitest suites arrive in W5 (decision D8), together with the per-tenant module toggle screen (D7).

## Rules

- Every change a platform administrator makes to a tenant must be written to the audit trail; module toggles will be too (W5).
- `src/pages/tenants/TenantDetailPage.tsx` (540 lines) is over the 500-line limit and is on the split list (W3).
