import { readFileSync } from 'fs';
import path from 'path';

// W7 (stage 2.16): the consoles' Content-Security-Policy (G31) and MinIO
// running unprivileged (G32), as the files ship them.

const ROOT = path.resolve(__dirname, '../../../..');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');

describe.each(['vairiot-web', 'vairiot-admin'])('%s Content-Security-Policy', (app) => {
  const conf = read(`${app}/nginx.conf.template`);
  const policy = /map \$uri \$vairiot_csp \{\s*default "([^"]+)";/.exec(conf)?.[1] ?? '';
  const directive = (name: string) => policy.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? '';

  it('sends the policy from every location', () => {
    const locations = conf.match(/location [^{]+\{[^}]*\}/g) ?? [];
    expect(locations.length).toBeGreaterThanOrEqual(2);
    for (const l of locations) expect(l).toContain('add_header Content-Security-Policy $vairiot_csp always;');
  });

  it('allows scripts from this origin only, and nothing that can run code from elsewhere', () => {
    expect(directive('script-src')).toBe("script-src 'self'");
    expect(policy).not.toMatch(/unsafe-eval/);
    expect(directive('object-src')).toBe("object-src 'none'");
    expect(directive('base-uri')).toBe("base-uri 'self'");
    expect(directive('frame-ancestors')).toBe("frame-ancestors 'self'");
  });

  it('takes the map tile servers and the API origin from the environment, with safe defaults', () => {
    expect(directive('img-src')).toContain('${CSP_TILE_HOSTS}');
    expect(directive('connect-src')).toBe("connect-src 'self' ${CSP_CONNECT_SRC}");
    const docker = read(`${app}/Dockerfile`);
    expect(docker).toContain('COPY ' + app + '/nginx.conf.template /etc/nginx/templates/default.conf.template');
    expect(docker).toContain('ENV CSP_TILE_HOSTS="https://tile.openstreetmap.org" CSP_CONNECT_SRC=""');
  });
});

describe('MinIO unprivileged (G32)', () => {
  it('runs as uid 10001 with no scanner exceptions left', () => {
    const docker = read('infra/minio/Dockerfile');
    expect(docker).toMatch(/^USER 10001$/m);
    expect(docker).not.toContain('nosemgrep');
    expect(read('.github/workflows/ci.yml')).not.toContain('--skip-files infra/minio/Dockerfile');
  });

  it('has deploy.sh hand existing data to that user, MinIO stopped, before starting the new image', () => {
    const deploy = read('infra/deploy.sh');
    const chown = deploy.indexOf('chown -R 10001:10001 "$MINIO_DATA"');
    expect(chown).toBeGreaterThan(-1);
    expect(deploy.indexOf('stop minio')).toBeLessThan(chown);
    expect(chown).toBeLessThan(deploy.indexOf('up -d --remove-orphans'));
    expect(read('infra/restore.sh')).toContain('docker exec -u 0 "$MINIO_CONTAINER" chown -R 10001:10001 /tmp/minio-restore');
  });
});
