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
