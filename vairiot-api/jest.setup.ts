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

// Bind supertest's throwaway servers to 127.0.0.1, the address supertest
// connects to. For `request(app)` supertest wraps the app in
// http.createServer() and calls `server.listen(0)`, which binds the wildcard
// address (::) on a random port, then requests http://127.0.0.1:<port>. On
// macOS a wildcard bind may share a port with another process's 127.0.0.1
// bind (Creative Cloud, IDE helpers, Docker port forwards…), and connections
// to 127.0.0.1 then reach *that* process. Tests got its answers — a 405, a
// 401, or a dropped connection ("socket hang up") — in roughly a quarter of
// local runs, e.g. RBAC logins with no token. Linux refuses the overlapping
// bind and picks another port, so CI never saw it.
//
// Binding 127.0.0.1 makes the kernel refuse a taken port, but that bind is
// asynchronous while supertest reads the port synchronously in its
// constructor. So the bind is deferred to end(), which is asynchronous anyway:
// the constructor gets a placeholder URL, and end() listens on 127.0.0.1,
// fills in the real port, then sends. Written against supertest 7.x internals
// (Test#serverAddress, Test#end, this._server); the regression test in
// src/__tests__/test-server-binding.test.ts fails if they change.
{
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Test } = require('supertest') as { Test: { prototype: Record<string, unknown> } };
  type Pending = { server: import('node:http').Server; path: string };
  type LoopbackTest = {
    url: string;
    _server?: import('node:http').Server;
    _loopback?: Pending;
  };
  const proto = Test.prototype;
  if (!proto.__loopbackPatched) {
    const serverAddress = proto.serverAddress as (this: LoopbackTest, app: unknown, path: string) => string;
    const end = proto.end as (this: LoopbackTest, fn?: (err: unknown, res: unknown) => void) => unknown;

    proto.serverAddress = function (this: LoopbackTest, app: import('node:http').Server, path: string) {
      if (app.address()) return serverAddress.call(this, app, path); // caller's own listening server
      this._loopback = { server: app, path };
      return `http://127.0.0.1:0${path}`; // real port filled in by end()
    };

    proto.end = function (this: LoopbackTest, fn?: (err: unknown, res: unknown) => void) {
      const pending = this._loopback;
      if (!pending) return end.call(this, fn);
      this._loopback = undefined;
      const onError = (err: Error) => fn?.(err, undefined);
      pending.server.once('error', onError);
      pending.server.listen(0, '127.0.0.1', () => {
        pending.server.off('error', onError);
        const { port } = pending.server.address() as import('node:net').AddressInfo;
        this.url = `http://127.0.0.1:${port}${pending.path}`;
        this._server = pending.server; // supertest closes it after the response
        end.call(this, fn);
      });
      return this;
    };
    proto.__loopbackPatched = true;
  }
}
