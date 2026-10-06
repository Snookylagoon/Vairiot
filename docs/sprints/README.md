# Vairiot Asset Intelligence — TUDA sprint scripts for Claude Code

Six sprint scripts (S0–S5) that take the Vairiot-dev repository from its current state to the system described in the TUDA fit-gap plan: hardened, GIS-enabled, IPSAS-compliant, reconciled and ready for handover.

| Sprint | File | Weeks | Delivers |
|---|---|---|---|
| S0 | `S0-hardening-and-hosting.md` | 1–2 | Offline data-loss fixes, backups, monitoring, TUDA tenant, register profiling |
| S1 | `S1-gis-condition-photos.md` | 3–6 | PostGIS, coordinates, mobile GPS capture, photo-per-scan, map view, condition scale |
| S2 | `S2-ipsas-ledger-import.md` | 7–10 | Asset classes and policies, componentisation, impairment, donated assets, depreciation run, Excel import |
| S3 | `S3-zones-qa-georgian.md` | 11–12 | Maker–checker approvals, zones and teams, QA sampling, Georgian i18n, training tenant |
| S4 | `S4-reconciliation-and-dq.md` | 17–22 | Pilot defects, new reconciliation classes, three-way reconciliation engine, data-quality dashboard |
| S5 | `S5-reporting-and-handover.md` | 23–28 | IPSAS reporting pack, GeoJSON/Shapefile exchange, handover pack |

## How to run a sprint

Each sprint file contains numbered **prompts**. Run them one at a time, in order, each in a fresh Claude Code conversation so the context stays small.

1. Open the Claude Code desktop app.
2. Open the folder `/Volumes/DRSssd/Projects/GitHub/Vairiot-dev`.
3. Create the sprint branch when the sprint file tells you to (the first prompt of each sprint does this).
4. Copy one prompt — everything between the ```` ``` ```` fences — and paste it into Claude Code.
5. Wait for it to finish. Read the summary and the **Files changed** list it gives you.
6. Run the checks in the prompt's **Acceptance** section. If something fails, paste the error back into the same conversation and ask it to fix it.
7. When the acceptance checks pass, commit using the command at the end of the prompt.
8. Move to the next prompt.

## Rules every prompt follows

- Work only inside `/Volumes/DRSssd/Projects/GitHub/Vairiot-dev`.
- Read `docs/known-fix-registry.md` before changing code; add every bug fixed to it.
- Schema changes go through a Prisma migration (`npm run db:migrate --workspace=vairiot-api`); never edit the database by hand.
- Every table carries `tenantId`; every service query filters by it.
- New API routes get an OpenAPI entry, express-validator rules and a Jest test.
- New screens use the Vairiot design system (Montserrat, IBM Plex Mono, brand gradient `#FF0DCC → #A05B97 → #615AA0`, charcoal `#2B3132`).
- Every prompt ends with a **Files changed** list with full paths, and the branch is pushed only when `npm run lint` and `npm test` pass.

## Before you start S0

Run these once in Terminal (or ask Claude Code to run them):

```bash
cd /Volumes/DRSssd/Projects/GitHub/Vairiot-dev
git checkout develop
git pull
npm install
cp .env.example .env   # only if .env is missing
```

## Tracking

Each sprint file ends with a **Sprint checklist**. Tick items off as prompts complete. Keep the files in `docs/sprints/` in the repository so the record travels with the code.
