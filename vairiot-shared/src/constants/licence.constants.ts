export const LicenceTier = {
  Free:   'FREE',
  Tier2:  'TIER_2',
  Tier3:  'TIER_3',
} as const;
export type LicenceTier = (typeof LicenceTier)[keyof typeof LicenceTier];

export const LICENCE_TIER_CONFIG = {
  FREE: {
    displayName: 'Free',
    maxAssets: 500,
    baseDevices: 1,
    pricePerYear: 0,
    pricePerDevice: 10,
    isPerpetual: true,
  },
  TIER_2: {
    displayName: 'Professional',
    maxAssets: 1500,
    baseDevices: 1,
    pricePerYear: 50,
    pricePerDevice: 10,
    isPerpetual: false,
  },
  TIER_3: {
    displayName: 'Enterprise',
    maxAssets: 2147483647, // unlimited in practice
    baseDevices: 1,
    pricePerYear: 100,
    pricePerDevice: 10,
    isPerpetual: false,
  },
} as const;

export const DEFAULT_GRACE_PERIOD_DAYS = 14;
export const DEFAULT_EXPIRY_WARNING_DAYS = 30;
export const DEFAULT_LICENCE_DURATION_MONTHS = 12;
