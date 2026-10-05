import fs from 'node:fs';
import path from 'node:path';

// Load .env for local test runs (the app itself relies on shell-exported env,
// and dotenv isn't a dependency). CI injects env directly, so a missing file is
// fine. Values already present in process.env always win.
const envPath = path.resolve(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue; // skips blanks, comments, and `export KEY=` lines
    const key = m[1];
    if (process.env[key] !== undefined) continue;
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

// Fallbacks so secret-dependent modules can be imported even without a .env
// (pure unit tests that never touch the database).
process.env.NODE_ENV ??= 'test';
process.env.JWT_SECRET ??= 'test-jwt-secret';
process.env.APP_ENCRYPTION_KEY ??= 'test-encryption-key-32-chars-min!';

// The suite is integration-heavy and includes tenant-delete tests. It must
// never touch a database that matters: on 2 Sep 2026 it was run against
// staging by mistake, and a bare `npm test` used the local dev database during
// the S0 baseline. Only a local database whose name ends in `_test` is allowed
// (scripts/test-api.sh and CI both use one). Override deliberately with
// ALLOW_ANY_TEST_DATABASE=1.
(() => {
  const url = process.env.DATABASE_URL;
  if (!url || process.env.ALLOW_ANY_TEST_DATABASE === '1') return;
  let host = '';
  let db = '';
  try {
    const parsed = new URL(url);
    host = parsed.hostname;
    db = parsed.pathname.replace(/^\//, '');
  } catch {
    // Unparseable URL: fall through to the refusal below.
  }
  const localHost = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
  if (!localHost || !db.endsWith('_test')) {
    throw new Error(
      `Refusing to run the API tests against database "${db || '?'}" on "${host || '?'}". ` +
      'Use `npm run test:api` (throwaway Postgres in Docker), or point DATABASE_URL at a local *_test database.',
    );
  }
})();
