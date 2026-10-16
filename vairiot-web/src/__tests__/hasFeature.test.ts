import type { UserProfile } from 'vairiot-shared';
import { describe, expect, it } from 'vitest';

import { hasFeature } from '@/stores/auth.store';

// GIS screens are shown only when the tenant has `gis` on (D7, stage 0.9).
describe('hasFeature', () => {
  const user = (featureFlags?: Record<string, boolean>) => ({ permissions: [], featureFlags }) as unknown as UserProfile;

  it('is off with no user, no flags or the flag unset', () => {
    expect(hasFeature(null, 'gis')).toBe(false);
    expect(hasFeature(user(), 'gis')).toBe(false);
    expect(hasFeature(user({ blindAudit: true }), 'gis')).toBe(false);
  });

  it('is on only when the flag is exactly true', () => {
    expect(hasFeature(user({ gis: true }), 'gis')).toBe(true);
    expect(hasFeature(user({ gis: false }), 'gis')).toBe(false);
  });
});
