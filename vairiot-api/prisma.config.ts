import { defineConfig, env } from 'prisma/config';

// Prisma 7 no longer accepts `url` inside the datasource block in
// schema.prisma. Connection details now serve two consumers separately: this
// file for the CLI (generate, migrate deploy, db pull), and a driver adapter
// for the runtime client in src/lib/prisma.ts.
//
// The API reads DATABASE_URL from the process environment in every
// environment that matters — docker compose injects it, CI sets it, and
// scripts/test-api.sh exports it — so there is nothing to load here. A .env is
// picked up when one happens to exist locally, and its absence is not an error.
try {
  process.loadEnvFile('.env');
} catch {
  // no .env here — DATABASE_URL is expected to be in the environment already
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
});
