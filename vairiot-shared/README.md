# vairiot-shared

| Item     | Detail                                                                             |
| -------- | ---------------------------------------------------------------------------------- |
| Package  | `vairiot-shared` — types, schemas and constants shared by every TypeScript package |
| Stack    | TypeScript 5, Zod 3, ESM output in `dist/`                                         |
| Revision | 0.1 (16 October 2026)                                                              |
| See also | [Data model and module registry](../docs/02-data-model-and-module-registry.md)     |

## Contents

| Path             | Contents                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------ |
| `src/constants/` | Roles, permissions (`resource:action`), `ROLES_REQUIRING_2FA`, asset and licence constants |
| `src/schemas/`   | Zod schemas (auth today)                                                                   |
| `src/types/`     | Shared types, including `UserProfile.featureFlags`                                         |
| `src/gs1/`       | GS1 and EPC encoding (GIAI-96/202, Digital Link, check digits)                             |
| `src/geo/`       | Coordinate validation                                                                      |
| `src/index.ts`   | Public entry point                                                                         |

The module registry (decision D7) will live here, built from the tenant feature flags (W5).

## Build

```bash
npm run build --workspace vairiot-shared
```

The build clears `dist/` and runs `tsc`. Build it before running or type-checking the API, web, admin or worker; CI does the same. The API's Jest config reads the TypeScript source directly, so API tests do not need the build.

## Test

```bash
npm test --workspace vairiot-shared
```

Jest with ts-jest; three suites (`constants`, `gs1`, `geo`), run in CI. Decision D8 sets 60 % lines by the end of S2 and 80 % by S4.

## Rules

- A change here can break every package: run `npm run typecheck` at the root afterwards.
- Workspace packages depend on this one as `"vairiot-shared": "*"`.
