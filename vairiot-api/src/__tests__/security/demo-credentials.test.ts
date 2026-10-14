import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import bcrypt from 'bcryptjs';

import { requirePassword } from '../../../prisma/demo-accounts';
import { rotateDemoPasswords } from '../../../prisma/rotate-demo-password';
import { prisma } from '../../lib/prisma';

// KFR-037: vairiot-web/public/auto-login.html posted the demo admin's email and
// password to /auth/login from a page every deployment served publicly, and
// seed.ts hard-coded the same password for every seed account.

const WEB_PUBLIC = join(__dirname, '../../../../vairiot-web/public');

function filesUnder(dir: string): string[] {
  // git keeps no empty folders: with auto-login.html gone, public/ may not exist.
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe('No credentials in the public web folder', () => {
  it('has no auto-login page', () => {
    expect(filesUnder(WEB_PUBLIC).some((f) => f.endsWith('auto-login.html'))).toBe(false);
  });

  it('has no file that signs in to the API', () => {
    const offenders = filesUnder(WEB_PUBLIC)
      .filter((f) => /\.(html?|js|json|txt)$/i.test(f))
      .filter((f) => {
        const text = readFileSync(f, 'utf8');
        return text.includes('/auth/login') && /password/i.test(text);
      });
    expect(offenders).toEqual([]);
  });
});

describe('Seed password comes from the environment', () => {
  it('refuses a missing password', () => {
    expect(() => requirePassword('SEED_DEMO_PASSWORD', {})).toThrow(/at least 12/);
  });

  it('refuses a short password', () => {
    expect(() => requirePassword('SEED_DEMO_PASSWORD', { SEED_DEMO_PASSWORD: 'short-pass' })).toThrow(/at least 12/);
  });

  it('accepts a long enough password', () => {
    expect(requirePassword('SEED_DEMO_PASSWORD', { SEED_DEMO_PASSWORD: 'a-long-enough-one' })).toBe('a-long-enough-one');
  });

  it('seed.ts holds no literal password any more', () => {
    const seed = readFileSync(join(__dirname, '../../../prisma/seed.ts'), 'utf8');
    expect(seed).toMatch(/requirePassword\('SEED_DEMO_PASSWORD'\)/);
    expect(seed).not.toMatch(/DEFAULT_PASS\s*=\s*'/);
  });
});

describe('rotateDemoPasswords', () => {
  const TID = 'test-demo-rotation';
  const OLD = 'leaked-demo-password-1';
  const NEW = 'fresh-demo-password-22';

  beforeAll(async () => {
    await prisma.tenant.upsert({
      where: { id: TID }, update: {}, create: { id: TID, name: 'Demo rotation test' },
    });
    const leaked = await bcrypt.hash(OLD, 4);
    const own = await bcrypt.hash('owner-chose-this-one', 4);
    // On the seed list, still on the leaked password → rotated
    await prisma.user.create({ data: { tenantId: TID, email: 'viewer@demo.vairiot.com', name: 'V', passwordHash: leaked } });
    // On the seed list, but the owner changed it → left alone
    await prisma.user.create({ data: { tenantId: TID, email: 'superadmin@vairiot.com', name: 'S', passwordHash: own } });
    // Leaked password but not a seed account → left alone
    await prisma.user.create({ data: { tenantId: TID, email: 'someone@else.test', name: 'X', passwordHash: leaked } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { tenantId: TID } });
    await prisma.tenant.delete({ where: { id: TID } });
    await prisma.$disconnect();
  });

  it('changes only seed accounts still on the leaked password', async () => {
    const { rotated } = await rotateDemoPasswords(OLD, NEW);
    expect(rotated).toContain(`viewer@demo.vairiot.com (${TID})`);
    expect(rotated.some((r) => r.startsWith('superadmin@vairiot.com') && r.includes(TID))).toBe(false);

    const users = await prisma.user.findMany({ where: { tenantId: TID } });
    const hashOf = (email: string) => users.find((u) => u.email === email)!.passwordHash!;
    expect(await bcrypt.compare(NEW, hashOf('viewer@demo.vairiot.com'))).toBe(true);
    expect(await bcrypt.compare('owner-chose-this-one', hashOf('superadmin@vairiot.com'))).toBe(true);
    expect(await bcrypt.compare(OLD, hashOf('someone@else.test'))).toBe(true);
  });

  it('refuses to "rotate" to the same password', async () => {
    await expect(rotateDemoPasswords(OLD, OLD)).rejects.toThrow(/differ/);
  });
});
