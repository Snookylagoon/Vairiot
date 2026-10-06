import { z } from 'zod';

// Per-tenant switches (Tenant.featureFlags). Unknown keys pass through, so a
// flag can be stored before the code that reads it ships.
const FeatureFlagsSchema = z.object({
  blindAudit: z.boolean().optional(),
  /** Map views and asset coordinates (S1, PostGIS). */
  gis: z.boolean().optional(),
  /** IPSAS asset accounting: ledger, depreciation policies, disclosures (S2). */
  ipsas: z.boolean().optional(),
  /** Register-to-ledger and count-to-register reconciliation (S4). */
  reconciliation: z.boolean().optional(),
}).passthrough();

export type FeatureFlags = z.infer<typeof FeatureFlagsSchema>;

export function parseFeatureFlags(raw: unknown): FeatureFlags {
  if (raw === null || raw === undefined) return {};
  const result = FeatureFlagsSchema.safeParse(raw);
  return result.success ? result.data : {};
}

export function tenantHasFeature(
  tenant: { featureFlags?: unknown },
  flag: keyof FeatureFlags,
): boolean {
  const flags = parseFeatureFlags(tenant.featureFlags);
  return flags[flag] === true;
}
