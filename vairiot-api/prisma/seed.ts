import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TENANT_ID    = 'demo';
const TENANT_NAME  = 'Vairiot Demo Co.';
const TENANT_SLUG  = 'demo';
const DEMO_EMAIL   = 'demo@vairiot.com';
const DEMO_NAME    = 'Demo Administrator';
const DEMO_PASS    = 'Demo1234!';
const ROLE_NAME    = 'Administrator';

const ROLE_PERMISSIONS = [
  'asset:read', 'asset:write', 'asset:delete',
  'audit:read', 'audit:write',
  'category:read', 'category:write',
  'site:read', 'site:write',
  'user:read', 'user:write',
];

async function main() {
  console.log('Seeding demo tenant and user…');

  const tenant = await prisma.tenant.upsert({
    where:  { id: TENANT_ID },
    update: { name: TENANT_NAME, slug: TENANT_SLUG, active: true },
    create: { id: TENANT_ID, name: TENANT_NAME, slug: TENANT_SLUG, active: true },
  });

  const role = await prisma.role.upsert({
    where:  { tenantId_name: { tenantId: tenant.id, name: ROLE_NAME } },
    update: { permissions: ROLE_PERMISSIONS, isSystem: true },
    create: { tenantId: tenant.id, name: ROLE_NAME, permissions: ROLE_PERMISSIONS, isSystem: true },
  });

  const passwordHash = await bcrypt.hash(DEMO_PASS, 12);

  const user = await prisma.user.upsert({
    where:  { tenantId_email: { tenantId: tenant.id, email: DEMO_EMAIL } },
    update: { name: DEMO_NAME, passwordHash, active: true },
    create: { tenantId: tenant.id, email: DEMO_EMAIL, name: DEMO_NAME, passwordHash, active: true },
  });

  await prisma.userRole.upsert({
    where:  { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });

  console.log('\n✅ Demo credentials');
  console.log('───────────────────────────────');
  console.log(`Organisation ID : ${tenant.id}`);
  console.log(`Email           : ${DEMO_EMAIL}`);
  console.log(`Password        : ${DEMO_PASS}`);
  console.log('───────────────────────────────\n');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
