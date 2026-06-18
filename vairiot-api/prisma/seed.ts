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
  'apikey:read', 'apikey:write',
];

const DEMO_ASSETS = [
  { num: 'A-1001', name: 'Dell Latitude 7440',     desc: '14" business laptop',  status: 'active', condition: 'good',      serial: 'DL7440-001', barcode: '1001-DL7440', rfid: 'E280-1001-DL7440' },
  { num: 'A-1002', name: 'HP LaserJet Pro M404',   desc: 'Office laser printer', status: 'active', condition: 'good',      serial: 'HP404-002',  barcode: '1002-HP404',  rfid: 'E280-1002-HP404' },
  { num: 'A-1003', name: 'Logitech MX Keys',       desc: 'Wireless keyboard',    status: 'active', condition: 'excellent', serial: 'LG-MXK-003', barcode: '1003-MXKEYS', rfid: 'E280-1003-MXKEYS' },
  { num: 'A-1004', name: 'Herman Miller Aeron',    desc: 'Ergonomic office chair', status: 'active', condition: 'good',    serial: 'HM-AER-004', barcode: '1004-AERON',  rfid: 'E280-1004-AERON' },
  { num: 'A-1005', name: 'Cisco Catalyst 2960',    desc: '24-port managed switch', status: 'active', condition: 'good',    serial: 'CS-2960-005', barcode: '1005-CSC2960', rfid: 'E280-1005-CSC2960' },
  { num: 'A-1006', name: 'Meferi ME65 Handheld',   desc: 'RFID/barcode handheld',  status: 'active', condition: 'good',    serial: 'MF-ME65-006', barcode: '1006-ME65',    rfid: 'E280-1006-ME65' },
];

async function main() {
  console.log('Seeding demo tenant, user, and reference data…');

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

  const category = await prisma.category.upsert({
    where:  { tenantId_name: { tenantId: tenant.id, name: 'IT Equipment' } },
    update: { description: 'Computing and networking hardware' },
    create: { tenantId: tenant.id, name: 'IT Equipment', description: 'Computing and networking hardware' },
  });

  const site = await prisma.site.upsert({
    where:  { tenantId_name: { tenantId: tenant.id, name: 'HQ' } },
    update: { address: '1 Demo Street', city: 'London', country: 'United Kingdom', active: true },
    create: { tenantId: tenant.id, name: 'HQ', address: '1 Demo Street', city: 'London', country: 'United Kingdom', active: true },
  });

  let location = await prisma.location.findFirst({ where: { siteId: site.id, name: 'Floor 1 — Office' } });
  if (!location) {
    location = await prisma.location.create({ data: { siteId: site.id, name: 'Floor 1 — Office', type: 'floor' } });
  }

  for (const a of DEMO_ASSETS) {
    await prisma.asset.upsert({
      where:  { tenantId_assetNumber: { tenantId: tenant.id, assetNumber: a.num } },
      update: {
        name: a.name, description: a.desc, status: a.status, condition: a.condition,
        serialNumber: a.serial, barcode: a.barcode, rfidTag: a.rfid,
        categoryId: category.id, siteId: site.id, locationId: location.id,
      },
      create: {
        tenantId: tenant.id, assetNumber: a.num, name: a.name, description: a.desc,
        status: a.status, condition: a.condition,
        serialNumber: a.serial, barcode: a.barcode, rfidTag: a.rfid,
        categoryId: category.id, siteId: site.id, locationId: location.id,
      },
    });
  }

  const campaignName = 'Q3 2026 Audit — HQ';
  let campaign = await prisma.auditCampaign.findFirst({ where: { tenantId: tenant.id, name: campaignName } });
  if (!campaign) {
    campaign = await prisma.auditCampaign.create({
      data: {
        tenantId: tenant.id, name: campaignName, siteId: site.id,
        status: 'in_progress', startedAt: new Date(), createdBy: user.id,
      },
    });
  } else if (campaign.status !== 'in_progress') {
    campaign = await prisma.auditCampaign.update({
      where: { id: campaign.id },
      data:  { status: 'in_progress', startedAt: new Date(), completedAt: null },
    });
  }

  console.log('\n✅ Demo credentials');
  console.log('───────────────────────────────');
  console.log(`Organisation ID : ${tenant.id}`);
  console.log(`Email           : ${DEMO_EMAIL}`);
  console.log(`Password        : ${DEMO_PASS}`);
  console.log('───────────────────────────────');
  console.log(`Assets seeded   : ${DEMO_ASSETS.length}`);
  console.log(`Audit campaign  : "${campaign.name}" (${campaign.status})`);
  console.log('Try any of these tags in the scanner / manual lookup:');
  DEMO_ASSETS.forEach(a => console.log(`  - ${a.barcode}  or  ${a.rfid}`));
  console.log();
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
