import type { EpcScheme } from './epc.js';
import type { TenantIdMode } from './identifier.js';

/** Gate for the irreversible EPC permalock operation. Spec §8.3. */
export function permalockAllowed(ctx: {
  mode: TenantIdMode;
  allowInternalPermalock: boolean;
  epcScheme: EpcScheme;
  verifiedAt: string | null;
  settlingPeriodDays: number;
  assetStatus: string;
  now: Date;
}): { allowed: boolean; reason?: string } {
  if (!ctx.verifiedAt) return { allowed: false, reason: 'Tag not verified after write' };
  if (ctx.mode === 'INTERNAL' && !ctx.allowInternalPermalock) {
    return { allowed: false, reason: 'Tenant is in INTERNAL mode' };
  }
  if (ctx.mode === 'GS1' && ctx.epcScheme !== 'GIAI96') {
    return { allowed: false, reason: `EPC scheme is ${ctx.epcScheme}` };
  }
  const ageDays = (ctx.now.getTime() - Date.parse(ctx.verifiedAt)) / 86_400_000;
  if (ageDays < ctx.settlingPeriodDays) {
    return { allowed: false, reason: 'Settling period not elapsed' };
  }
  if (['DISPOSED', 'LOST', 'disposed', 'lost'].includes(ctx.assetStatus)) {
    return { allowed: false, reason: `Asset status is ${ctx.assetStatus}` };
  }
  return { allowed: true };
}
