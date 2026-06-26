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
