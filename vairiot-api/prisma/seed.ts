import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { ROLE_PERMISSION_MATRIX, ALL_ROLE_NAMES } from 'vairiot-shared';
import { LICENCE_TIER_CONFIG } from 'vairiot-shared';

const prisma = new PrismaClient();

const TENANT_ID   = 'demo';
const TENANT_NAME = 'Vairiot Demo Co.';
const DEFAULT_PASS = 'DemoPassword1!';

// One user per role — 11 users total + the original demo admin
const SEED_USERS: { email: string; name: string; roleName: string }[] = [
  { email: 'superadmin@vairiot.com',  name: 'Platform Super Admin',   roleName: 'Platform Super Admin' },
  { email: 'licensing@vairiot.com',   name: 'Licensing Authority',    roleName: 'Licensing Authority' },
  { email: 'admin@demo.vairiot.com',  name: 'Company Administrator',  roleName: 'Company Admin' },
  { email: 'assets@demo.vairiot.com', name: 'Asset Manager',          roleName: 'Asset Manager' },
  { email: 'maint-mgr@demo.vairiot.com', name: 'Maintenance Manager', roleName: 'Maintenance Manager' },
  { email: 'tech@demo.vairiot.com',   name: 'Maintenance Technician', roleName: 'Maintenance Technician' },
  { email: 'collector@demo.vairiot.com', name: 'Data Collector',      roleName: 'Data Collector' },
  { email: 'auditor@demo.vairiot.com', name: 'Auditor',               roleName: 'Auditor' },
  { email: 'viewer@demo.vairiot.com',  name: 'Viewer',                roleName: 'Viewer' },
  { email: 'stakeholder@client.com',   name: 'Client Stakeholder',    roleName: 'Client Stakeholder' },
  { email: 'authority@client.com',     name: 'Client Authority',      roleName: 'Client Authority' },
];

const DEMO_ASSETS = [
  { num: 'A-1001', name: 'Dell Latitude 7440',   desc: '14" business laptop',    status: 'active', condition: 'good',      serial: 'DL7440-001', barcode: '1001-DL7440', rfid: 'E280-1001-DL7440' },
  { num: 'A-1002', name: 'HP LaserJet Pro M404',  desc: 'Office laser printer',   status: 'active', condition: 'good',      serial: 'HP404-002',  barcode: '1002-HP404',  rfid: 'E280-1002-HP404' },
  { num: 'A-1003', name: 'Logitech MX Keys',      desc: 'Wireless keyboard',      status: 'active', condition: 'excellent', serial: 'LG-MXK-003', barcode: '1003-MXKEYS', rfid: 'E280-1003-MXKEYS' },
  { num: 'A-1004', name: 'Herman Miller Aeron',   desc: 'Ergonomic office chair',  status: 'active', condition: 'good',     serial: 'HM-AER-004', barcode: '1004-AERON',  rfid: 'E280-1004-AERON' },
  { num: 'A-1005', name: 'Cisco Catalyst 2960',   desc: '24-port managed switch',  status: 'active', condition: 'good',     serial: 'CS-2960-005', barcode: '1005-CSC2960', rfid: 'E280-1005-CSC2960' },
  { num: 'A-1006', name: 'Meferi ME65 Handheld',  desc: 'RFID/barcode handheld',   status: 'active', condition: 'good',     serial: 'MF-ME65-006', barcode: '1006-ME65',    rfid: 'E280-1006-ME65' },
];

async function main() {
  console.log('Seeding demo tenant, roles, users, licence tiers, and reference data…\n');

  // ── Tenant ─────────────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where:  { id: TENANT_ID },
    update: { name: TENANT_NAME, active: true, onboardingComplete: true },
    create: { id: TENANT_ID, name: TENANT_NAME, active: true, onboardingComplete: true },
  });

  // ── Roles from ROLE_PERMISSION_MATRIX (single source of truth) ────────────
  const roleMap = new Map<string, string>(); // name → id
  for (const def of ROLE_PERMISSION_MATRIX) {
    const role = await prisma.role.upsert({
      where:  { tenantId_name: { tenantId: tenant.id, name: def.name } },
      update: { permissions: [...def.permissions], isSystem: def.isSystem },
      create: { tenantId: tenant.id, name: def.name, permissions: [...def.permissions], isSystem: def.isSystem },
    });
    roleMap.set(def.name, role.id);
  }
  console.log(`  Roles seeded: ${ALL_ROLE_NAMES.length}`);

  // ── Users (one per role) ───────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash(DEFAULT_PASS, 12);
  for (const u of SEED_USERS) {
    const user = await prisma.user.upsert({
      where:  { tenantId_email: { tenantId: tenant.id, email: u.email } },
      update: { name: u.name, passwordHash, active: true },
      create: { tenantId: tenant.id, email: u.email, name: u.name, passwordHash, active: true },
    });
    const roleId = roleMap.get(u.roleName);
    if (roleId) {
      await prisma.userRole.upsert({
        where:  { userId_roleId: { userId: user.id, roleId } },
        update: {},
        create: { userId: user.id, roleId },
      });
    }
  }
  console.log(`  Users seeded: ${SEED_USERS.length}`);

  // ── Licence Tiers ──────────────────────────────────────────────────────────
  for (const [tierName, config] of Object.entries(LICENCE_TIER_CONFIG)) {
    await prisma.licenceTier.upsert({
      where:  { name: tierName },
      update: {
        displayName: config.displayName,
        maxAssets: config.maxAssets,
        baseDevices: config.baseDevices,
        pricePerYear: config.pricePerYear,
        pricePerDevice: config.pricePerDevice,
        isPerpetual: config.isPerpetual,
      },
      create: {
        name: tierName,
        displayName: config.displayName,
        maxAssets: config.maxAssets,
        baseDevices: config.baseDevices,
        pricePerYear: config.pricePerYear,
        pricePerDevice: config.pricePerDevice,
        isPerpetual: config.isPerpetual,
      },
    });
  }
  console.log('  Licence tiers seeded: FREE, TIER_2, TIER_3');

  // ── Active FREE licence for the demo tenant ────────────────────────────────
  const freeTier = await prisma.licenceTier.findUnique({ where: { name: 'FREE' } });
  if (freeTier) {
    const existingLicence = await prisma.licence.findFirst({ where: { tenantId: tenant.id, status: 'active' } });
    if (!existingLicence) {
      const seq = await prisma.$queryRawUnsafe<{ next: bigint }[]>(
        `SELECT nextval('licence_number_seq') AS next`,
      );
      const rand = Array.from({ length: 6 }, () =>
        'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 30)],
      ).join('');
      await prisma.licence.create({
        data: {
          tenantId: tenant.id,
          tierId: freeTier.id,
          licenceNumber: `VAI-${Number(seq[0].next)}-${rand}`,
          status: 'active',
          activatedAt: new Date(),
          paymentConfirmed: true,
        },
      });
      console.log('  Licence activated: FREE (perpetual)');
    } else {
      console.log(`  Licence exists: ${existingLicence.status}`);
    }
  }

  // ── Onboarding progress ────────────────────────────────────────────────────
  const superAdmin = await prisma.user.findFirst({ where: { tenantId: tenant.id, email: 'superadmin@vairiot.com' } });
  if (superAdmin) {
    await prisma.onboardingProgress.upsert({
      where: { tenantId_step: { tenantId: tenant.id, step: 'user_registration' } },
      update: { completed: true, completedAt: new Date(), completedBy: superAdmin.id },
      create: { tenantId: tenant.id, step: 'user_registration', completed: true, completedAt: new Date(), completedBy: superAdmin.id },
    });
    await prisma.onboardingProgress.upsert({
      where: { tenantId_step: { tenantId: tenant.id, step: 'company_registration' } },
      update: { completed: true, completedAt: new Date(), completedBy: superAdmin.id },
      create: { tenantId: tenant.id, step: 'company_registration', completed: true, completedAt: new Date(), completedBy: superAdmin.id },
    });
    await prisma.onboardingProgress.upsert({
      where: { tenantId_step: { tenantId: tenant.id, step: 'licence_activation' } },
      update: { completed: true, completedAt: new Date(), completedBy: superAdmin.id },
      create: { tenantId: tenant.id, step: 'licence_activation', completed: true, completedAt: new Date(), completedBy: superAdmin.id },
    });
    console.log('  Onboarding progress: complete');
  }

  // ── Company ────────────────────────────────────────────────────────────────
  await prisma.company.upsert({
    where:  { tenantId: tenant.id },
    update: {
      legalName: TENANT_NAME, addressLine1: '1 Demo Street', city: 'Wellington',
      country: 'New Zealand', primaryContactName: 'Platform Super Admin', primaryContactEmail: 'superadmin@vairiot.com',
    },
    create: {
      tenantId: tenant.id, legalName: TENANT_NAME, addressLine1: '1 Demo Street', city: 'Wellington',
      country: 'New Zealand', primaryContactName: 'Platform Super Admin', primaryContactEmail: 'superadmin@vairiot.com',
    },
  });

  // ── Categories, sites, assets, audit campaign (unchanged) ──────────────────
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
    const firstUser = await prisma.user.findFirst({ where: { tenantId: tenant.id } });
    campaign = await prisma.auditCampaign.create({
      data: {
        tenantId: tenant.id, name: campaignName, siteId: site.id,
        status: 'in_progress', startedAt: new Date(), createdBy: firstUser!.id,
      },
    });
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n✅ Seed complete');
  console.log('───────────────────────────────────────────────────────────');
  console.log(`Organisation ID : ${tenant.id}`);
  console.log(`Default password: ${DEFAULT_PASS}`);
  console.log('');
  console.log('Users:');
  for (const u of SEED_USERS) {
    console.log(`  ${u.email.padEnd(35)} → ${u.roleName}`);
  }
  console.log('');
  console.log(`Assets          : ${DEMO_ASSETS.length}`);
  console.log(`Licence         : FREE (perpetual)`);
  console.log(`Audit campaign  : "${campaignName}"`);
  console.log('───────────────────────────────────────────────────────────');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
