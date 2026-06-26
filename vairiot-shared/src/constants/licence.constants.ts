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
    baseDevices: 3,
    pricePerYear: 0,
    pricePerDevice: 10,
    isPerpetual: true,
  },
  TIER_2: {
    displayName: 'Professional',
    maxAssets: 1500,
    baseDevices: 10,
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

// How often a logged-in client (mobile handset, browser) pings the device
// heartbeat endpoint, and how long after the last ping a device is still
// considered "online / connected now". The threshold allows a few intervals of
// grace so a single missed ping doesn't flip a device offline.
export const DEVICE_HEARTBEAT_INTERVAL_SECONDS = 60;
export const DEVICE_ONLINE_THRESHOLD_SECONDS = 180;
