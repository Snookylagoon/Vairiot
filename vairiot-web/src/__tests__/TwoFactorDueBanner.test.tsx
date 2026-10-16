import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { TwoFactorDueBanner } from '@/components/layout/TwoFactorDueBanner';
import { useAuthStore } from '@/stores/auth.store';

// D6 (stage 1.18): administrators see when two-factor becomes required.
const show = (twoFactorSetupDueBy: string | null) => {
  useAuthStore.setState({ user: { permissions: [], twoFactorSetupDueBy } as never });
  render(<MemoryRouter><TwoFactorDueBanner /></MemoryRouter>);
};

describe('TwoFactorDueBanner', () => {
  it('shows the due date and links to set-up', () => {
    show('2026-10-30T09:00:00Z');
    expect(screen.getByRole('status')).toHaveTextContent('required for your role from 30 October 2026');
    expect(screen.getByText('Set it up now').closest('a')).toHaveAttribute('href', '/settings/2fa');
  });

  it('stays hidden when nothing is due', () => {
    show(null);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
