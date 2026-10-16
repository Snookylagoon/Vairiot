import request from 'supertest';

import { createApp } from '../../app';
import { decryptSecret, encryptSecret } from '../../lib/crypto';
import { prisma } from '../../lib/prisma';
import { escapeHtml } from '../../routes/ios/ios.router';

// W6 (stage 1.17) fixes from the Semgrep triage (G27).

const app = createApp();
const VERSION_CODE = 990_001;

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY ??= 'local-test-encryption-key-32-chars!!';
});

afterAll(async () => {
  await prisma.iosRelease.deleteMany({ where: { versionCode: VERSION_CODE } });
  await prisma.$disconnect();
});

describe('public iOS install page', () => {
  it('escapes release data typed by a platform admin', async () => {
    await prisma.iosRelease.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
    await prisma.iosRelease.create({ data: {
      versionCode: VERSION_CODE, versionName: '2.5.0"><img src=x>', storageKey: 'ios/test.ipa', sizeBytes: 1024,
      sha256: 'x', releaseNotes: '<script>alert(1)</script>\nSecond line', isCurrent: true,
    } });
    const r = await request(app).get('/api/v1/ios/install');
    expect(r.status).toBe(200);
    expect(r.text).not.toContain('<script>alert(1)</script>');
    expect(r.text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;<br>Second line');
    expect(r.text).not.toContain('<img src=x>');
  });

  it('escapes the five HTML characters', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  });
});

describe('AES-GCM secrets', () => {
  it('round-trips and refuses a truncated tag', () => {
    const payload = encryptSecret('smtp-password');
    expect(decryptSecret(payload)).toBe('smtp-password');
    const [ver, iv, tag, enc] = payload.split(':');
    const shortTag = Buffer.from(tag, 'base64').subarray(0, 4).toString('base64');
    expect(() => decryptSecret([ver, iv, shortTag, enc].join(':'))).toThrow();
  });
});
