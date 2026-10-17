import { AppError, ForbiddenError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { withoutTenantScope } from '../lib/tenant-context';

import { getRootTenantId, getTenantFamily } from './licence.service';

// A tier's maxAssets of -1 (or any value below zero) means unlimited: the
// Enterprise tier is created that way by registration and platform-admin.
// The old check was `count >= maxAssets`, which is always true for -1, so every
// Enterprise tenant was refused its first asset (KFR-038).
export function isUnlimitedCap(maxAssets: number): boolean {
  return maxAssets < 0;
}

export interface AssetHeadroom {
  count: number;
  maxAssets: number;
  /** Assets that may still be added; Infinity when the tier is unlimited. */
  remaining: number;
}

export async function getAssetHeadroom(tenantId: string): Promise<AssetHeadroom> {
  const rootTenantId = await getRootTenantId(tenantId);

  // A sub-tenant's cap is its parent's licence, so this read crosses tenants (RLS, D5).
  const licence = await withoutTenantScope(() => prisma.licence.findFirst({
    where: { tenantId: rootTenantId, status: { in: ['active', 'expiring'] } },
    include: { tier: true },
  }));

  if (!licence) {
    throw new ForbiddenError('No active licence — cannot create assets');
  }

  const tenantIds = await getTenantFamily(rootTenantId);
  // The licence covers the whole family, so this count crosses tenants (RLS, D5).
  const count = await withoutTenantScope(() => prisma.asset.count({ where: { tenantId: { in: tenantIds }, deletedAt: null } }));
  const maxAssets = licence.tier.maxAssets;
  const remaining = isUnlimitedCap(maxAssets) ? Infinity : Math.max(0, maxAssets - count);
  return { count, maxAssets, remaining };
}

/**
 * Refuses the request when adding `adding` assets would exceed the licence cap.
 * The bulk importer passes its row count, so an import can no longer push a
 * tenant past its tier (KFR-039).
 */
export async function enforceAssetCap(tenantId: string, adding = 1): Promise<void> {
  const { count, maxAssets, remaining } = await getAssetHeadroom(tenantId);
  if (adding <= remaining) return;

  const detail = adding === 1
    ? `Asset limit reached (${count}/${maxAssets}).`
    : `Adding ${adding} assets would exceed the limit (${count}/${maxAssets}, ${remaining} left).`;
  throw new AppError(403, `${detail} Upgrade your licence to add more assets.`, 'ASSET_CAP_REACHED');
}
