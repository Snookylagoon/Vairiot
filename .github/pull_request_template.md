## Summary

<!-- What changes and why. Name the stage (N.s), sprint prompt (e.g. S1.3) or requirement (REQ-xx) it serves. -->

## How it was tested

<!-- Commands run, screens checked, devices used. -->

## Checklist

- [ ] Tests added or updated (Jest for API routes, Vitest for web, JUnit / XCTest for the apps); a bug fix includes a test that fails without it
- [ ] `npm run check` passes locally (line limits, British English, versions, lint, type-check)
- [ ] No file exceeds 500 lines, and no file on `scripts/line-limit-baseline.txt` grew
- [ ] British English in comments, user-facing text and documentation
- [ ] The feature respects its module switch (`Tenant.featureFlags`): off means 404 and hidden screens
- [ ] Tenancy respected: every query filters by `tenantId`; no cross-tenant access
- [ ] New API routes have an OpenAPI entry, validation and a permission guard
- [ ] No secrets, credentials or personal data committed
- [ ] Prisma migrations are additive and have been run against a fresh database
- [ ] `docs/stage-log.md`, `CHANGELOG.md` and `docs/known-fix-registry.md` updated where needed
