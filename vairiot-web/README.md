# vairiot-web

| Item     | Detail                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------- |
| Package  | `vairiot-web` — tenant console of Vairiot Asset Intelligence                                   |
| Stack    | React 19, Vite 8, Tailwind 4, React Router 7, TanStack Query, Zustand, Leaflet                 |
| Revision | 0.1 (16 October 2026)                                                                          |
| See also | [Technology stack](../docs/01-technology-stack.md) · [Test plan](../docs/testing/test-plan.md) |

The console tenants use every day: assets, sites, categories, audits, maintenance, labels, reports, imports, settings and the map. Served by nginx at `vai.vairiot.com` (staging `test.vairiot.com`).

## Layout

| Path              | Contents                                                       |
| ----------------- | -------------------------------------------------------------- |
| `src/pages/`      | One folder per area (`assets`, `audits`, `labels`, `admin`, …) |
| `src/components/` | Shared UI, forms, layout (`AppShell`), geo components          |
| `src/hooks/`      | TanStack Query hooks per resource                              |
| `src/stores/`     | `auth.store.ts` (user, permissions, `hasFeature`)              |
| `src/lib/`        | API client, monitoring (Sentry), registration flag             |
| `src/__tests__/`  | Vitest suites                                                  |

## Set up

```bash
npm install                                  # from the repository root
npm run build --workspace vairiot-shared     # the console imports vairiot-shared
```

The development server proxies `/api` to `http://localhost:3001`, so run the API too (`npm run dev:api`).

## Run

| Task                           | Command (from the repository root)                            |
| ------------------------------ | ------------------------------------------------------------- |
| Development server (port 3000) | `npm run dev:web` (set `PORT` to change it)                   |
| Build                          | `npm run build --workspace vairiot-web` (`tsc && vite build`) |
| Preview the build              | `npm run preview --workspace vairiot-web`                     |
| Type-check                     | `npm run typecheck --workspace vairiot-web`                   |

Build arguments used by the Docker image: `VITE_ALLOW_REGISTRATION` (`false` on standalone installs) and `VITE_SENTRY_DSN` (optional).

## Test

| Task     | Command                                           |
| -------- | ------------------------------------------------- |
| Run once | `npm test --workspace vairiot-web` (`vitest run`) |
| Watch    | `npm run test:watch --workspace vairiot-web`      |

Vitest runs in jsdom with Testing Library (`src/test-setup.ts`). No coverage gate yet; decision D8 sets 60 % by the end of S2 and 80 % by S4.

## Rules

- Switchable modules are hidden with `hasFeature(user, '<flag>')`; the API also refuses them, so hiding is not the only guard.
- Use the design system: Montserrat, IBM Plex Mono for codes, brand gradient `#FF0DCC → #A05B97 → #615AA0`, charcoal `#2B3132`.
- `src/pages/labels/LabelsPage.tsx` (992 lines) is over the 500-line limit and is on the split list (W3).
