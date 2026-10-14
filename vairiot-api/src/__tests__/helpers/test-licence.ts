import { prisma } from '../../lib/prisma';

// Gated writes need a licence since requireActiveLicence was mounted
// (KFR-040), as every real tenant has from registration, platform admin or a
// seed. Suites whose fixture tenant had none call this after creating it, and
// removeTestLicence before deleting the tenant.

export async function ensureTestLicence(tenantId: string): Promise<void> {
  const tier = await prisma.licenceTier.upsert({
    where: { name: 'FREE' },
    update: {},
    create: { name: 'FREE', displayName: 'Free', maxAssets: 500, pricePerYear: 0, isPerpetual: true },
  });
  const existing = await prisma.licence.findFirst({ where: { tenantId, status: { in: ['active', 'expiring'] } } });
  if (existing) return;
  await prisma.licence.create({
    data: {
      tenantId, tierId: tier.id, status: 'active', activatedAt: new Date(), paymentConfirmed: true,
      licenceNumber: `VAI-TEST-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    },
  });
}

export async function removeTestLicence(tenantId: string): Promise<void> {
  await prisma.deviceSlot.deleteMany({ where: { licence: { tenantId } } });
  await prisma.licence.deleteMany({ where: { tenantId } });
}
