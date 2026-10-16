import type { ModuleKey } from 'vairiot-shared';

import { tenantHasFeature } from '../lib/feature-flags';
import { prisma } from '../lib/prisma';

/**
 * Whether a tenant has a feature switched on (Tenant.featureFlags). Read from
 * the database on every call: flags change rarely, but a switch must take
 * effect at once, and the lookup is a primary-key read.
 */
export async function tenantFeatureEnabled(tenantId: string, flag: ModuleKey): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { featureFlags: true } });
  return tenant !== null && tenantHasFeature(tenant, flag);
}
