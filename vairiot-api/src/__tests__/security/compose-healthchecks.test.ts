import { readFileSync } from 'fs';
import path from 'path';

// KFR-044 (stage 1.21): the nginx healthcheck asked for http://localhost, which
// the image's wget resolves to ::1 first, while every site listens on IPv4
// only. nginx never became healthy and deploy.sh timed out waiting for it.

const INFRA = path.resolve(__dirname, '../../../../infra');

function nginxHealthcheck(file: string): string {
  const compose = readFileSync(path.join(INFRA, file), 'utf8');
  const nginx = compose.slice(compose.indexOf('\n  nginx:'));
  const test = nginx.match(/^\s+test:\s*(.+)$/m);
  if (!test) throw new Error(`no nginx healthcheck in ${file}`);
  return test[1];
}

it('the production nginx healthcheck uses the IPv4 loopback the sites listen on', () => {
  const check = nginxHealthcheck('docker-compose.prod.yml');
  expect(check).toContain('http://127.0.0.1/nginx-health');
  expect(check).not.toMatch(/localhost/);
});

it('every nginx site still listens on IPv4 port 80, which the healthcheck relies on', () => {
  for (const conf of ['prod.conf', 'staging.conf', 'standalone.conf.template']) {
    expect(readFileSync(path.join(INFRA, 'nginx', conf), 'utf8')).toMatch(/listen 80 default_server;/);
  }
});

// KFR-047 (stage 3.1): the Postgres images initialise a fresh data directory
// with a temporary server on the socket only, then restart it. A socket check
// called that one healthy, and the restore test's restore was cut off by the
// restart. Every Postgres healthcheck asks over TCP, which only the real
// server answers.
it('every Postgres healthcheck asks over TCP', () => {
  const files = ['docker-compose.prod.yml', 'docker-compose.yml', 'docker-compose.infra.yml', 'docker-compose.test.yml', 'docker-compose.restoretest.yml'];
  for (const f of files) {
    const checks = readFileSync(path.join(INFRA, f), 'utf8').match(/pg_isready[^"'\]]*/g) ?? [];
    expect([f, checks.length > 0]).toEqual([f, true]);
    for (const c of checks) expect([f, c]).toEqual([f, expect.stringContaining('-h 127.0.0.1')]);
  }
});
