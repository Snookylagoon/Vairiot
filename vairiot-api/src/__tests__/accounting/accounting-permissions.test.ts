import { readFileSync } from 'fs';
import path from 'path';

import pg from 'pg';
import { ALL_PERMISSIONS, Permission, ROLE_PERMISSION_MATRIX, RoleName } from 'vairiot-shared';

import { TUDA_ROLES } from '../../../prisma/seed-tuda';
import { prisma } from '../../lib/prisma';

// D16 (stage 2.1): accounting:read / write / approve, on the built-in roles,
// the TUDA roles, and — through a migration — on roles existing tenants
// already have.

const ACCOUNTING = [Permission.AccountingRead, Permission.AccountingWrite, Permission.AccountingApprove];
const MIGRATION = path.resolve(__dirname, '../../../prisma/migrations/20261016070000_accounting_permissions/migration.sql');
const TID = 'test-accounting-permissions';
const OTHER = 'test-accounting-permissions-other';

const permsOf = (name: string) => ROLE_PERMISSION_MATRIX.find((r) => r.name === name)!.permissions;

describe('accounting permissions', () => {
  it('are valid permissions', () => {
    for (const p of ACCOUNTING) expect(ALL_PERMISSIONS).toContain(p);
  });

  it('go to the built-in roles as decided', () => {
    expect(permsOf(RoleName.CompanyAdmin)).toEqual(expect.arrayContaining(ACCOUNTING));
    expect(permsOf(RoleName.PlatformSuperAdmin)).toEqual(expect.arrayContaining(ACCOUNTING));
    for (const name of [RoleName.AssetManager, RoleName.Auditor]) {
      expect(permsOf(name)).toContain(Permission.AccountingRead);
      expect(permsOf(name)).not.toContain(Permission.AccountingWrite);
    }
    expect(permsOf(RoleName.Viewer).some((p) => p.startsWith('accounting:'))).toBe(false);
  });

  it('give TUDA Finance all three and the Administrator no approval', () => {
    expect(TUDA_ROLES.Finance).toEqual(expect.arrayContaining(ACCOUNTING));
    expect(TUDA_ROLES.Administrator).toEqual(expect.arrayContaining([Permission.AccountingRead, Permission.AccountingWrite]));
    expect(TUDA_ROLES.Administrator).not.toContain(Permission.AccountingApprove);
    expect(TUDA_ROLES['Inventory Manager']).toContain(Permission.AccountingRead);
    expect(TUDA_ROLES['Field Operator'].some((p) => p.startsWith('accounting:'))).toBe(false);
  });
});

describe('migration 20261016070000_accounting_permissions', () => {
  beforeAll(async () => {
    for (const id of [TID, OTHER]) {
      await prisma.tenant.upsert({ where: { id }, update: {}, create: { id, name: id } });
    }
    await prisma.role.createMany({
      data: [
        { tenantId: TID, name: RoleName.CompanyAdmin, isSystem: true, permissions: ['asset:read'] },
        { tenantId: TID, name: RoleName.Auditor, isSystem: true, permissions: ['audit:read', 'accounting:read'] },
        { tenantId: TID, name: RoleName.Viewer, isSystem: true, permissions: ['asset:read'] },
        // A tenant's own role that happens to share a TUDA name is left alone.
        { tenantId: OTHER, name: 'Finance', isSystem: true, permissions: ['report:read'] },
        { tenantId: OTHER, name: RoleName.CompanyAdmin, isSystem: false, permissions: [] },
      ],
    });
  });

  afterAll(async () => {
    await prisma.role.deleteMany({ where: { tenantId: { in: [TID, OTHER] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [TID, OTHER] } } });
    await prisma.$disconnect();
  });

  async function runMigration() {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try { await client.query(readFileSync(MIGRATION, 'utf8')); } finally { await client.end(); }
  }

  const perms = async (tenantId: string, name: string) =>
    (await prisma.role.findUniqueOrThrow({ where: { tenantId_name: { tenantId, name } } })).permissions;

  it('grants existing built-in roles their permissions, once', async () => {
    await runMigration();
    await runMigration();
    const admin = await perms(TID, RoleName.CompanyAdmin);
    expect(admin).toEqual(expect.arrayContaining(['asset:read', ...ACCOUNTING]));
    expect(new Set(admin).size).toBe(admin.length);
    expect((await perms(TID, RoleName.Auditor)).filter((p) => p === 'accounting:read')).toHaveLength(1);
    expect((await perms(TID, RoleName.Viewer))).toEqual(['asset:read']);
  });

  it('leaves other tenants’ roles and custom roles alone', async () => {
    await runMigration();
    expect(await perms(OTHER, 'Finance')).toEqual(['report:read']);
    expect(await perms(OTHER, RoleName.CompanyAdmin)).toEqual([]);
  });
});
