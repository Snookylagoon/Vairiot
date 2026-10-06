import { describe, expect, it } from 'vitest';

import { registrationOpen } from '../lib/registration';

describe('registrationOpen', () => {
  it('is open by default (SaaS)', () => {
    expect(registrationOpen(undefined)).toBe(true);
    expect(registrationOpen('')).toBe(true);
    expect(registrationOpen('true')).toBe(true);
  });
  it('closes only when explicitly set to "false" (standalone)', () => {
    expect(registrationOpen('false')).toBe(false);
  });
});
