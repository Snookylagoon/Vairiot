import { defineConfig } from 'prisma/config';

// Prisma 7 no longer accepts `url` inside the datasource block in
// schema.prisma. Connection details now serve two consumers separately: this
// file for the CLI (migrate deploy, db execute, db pull), and a driver adapter
// for the runtime client in src/lib/prisma.ts.
//
// The datasource is set only when DATABASE_URL is actually present, and that
// is deliberate. `prisma generate` needs the schema, not a database — but it
// runs from this package's postinstall, which means it runs during
// `npm install` inside the Docker build, where no DATABASE_URL exists and
// none should. Prisma's own `env()` helper throws on a missing variable at
// config-load time, which broke the image build. Reading it directly and
// omitting the key keeps `generate` working everywhere while migration
// commands still get the URL wherever one is set (compose injects it, CI sets
// it, scripts/test-api.sh exports it).
const url = process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  ...(url ? { datasource: { url } } : {}),
});
