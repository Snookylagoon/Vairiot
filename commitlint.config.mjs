// Conventional commits (standard §6.2): <type>(<scope>): <summary>.
// Scopes are the package or module (api, web, admin, mobile, ios, shared,
// reports, worker, infra, gis, security) or the phase for documents
// (docs(phase-1): …). Release commits are chore(release): x.y.z.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Summaries name things like GS1, PostGIS and D7; don't force lower case.
    'subject-case': [0],
    'body-max-line-length': [0],
  },
};
