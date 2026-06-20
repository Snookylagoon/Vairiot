import { z } from 'zod';

const FeatureFlagsSchema = z.object({
  blindAudit: z.boolean().optional(),
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
