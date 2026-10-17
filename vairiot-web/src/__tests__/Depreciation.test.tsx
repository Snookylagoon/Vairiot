import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AssetDepreciation } from '@/components/assets/AssetDepreciation';
import { PeriodsPage } from '@/pages/accounting/PeriodsPage';
import { useAuthStore } from '@/stores/auth.store';

// Stage 2.9: periods, runs and posted depreciation in the web console.

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();
vi.mock('@/lib/api', () => ({ api: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a), put: (...a: unknown[]) => put(...a) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const run = (id: string, status: string, preparedBy: string) => ({
  id, status, preparedBy, assetCount: 2, totalCharge: '136.9', postedBy: null, postedAt: null, reversalOfRunId: null, createdAt: '',
  preview: { byClass: [{ classCode: 'SGN', count: 2, charge: '136.90' }], skipped: { not_recognised: 1 } },
});
const PERIODS = [
  { id: 'p11', year: 2026, month: 11, status: 'OPEN', runs: [run('r2', 'DRAFT', 'someone-else')] },
  { id: 'p10', year: 2026, month: 10, status: 'OPEN', runs: [run('r1', 'DRAFT', 'me')] },
  { id: 'p9', year: 2026, month: 9, status: 'CLOSED', runs: [{ ...run('r0', 'POSTED', 'someone-else'), postedBy: 'me' }] },
];
const BY_CLASS = {
  period: { year: 2026, month: 9 },
  rows: [{ classCode: 'SGN', className: 'Signs', assetCount: 1, periodCharge: '11.90', accumulated: '23.80', cost: '1000.00', carryingAmount: '976.20' }],
  totals: { assetCount: 1, periodCharge: '11.90', accumulated: '23.80', cost: '1000.00', carryingAmount: '976.20' },
};
const HISTORY = {
  entries: [
    { id: 'e1', year: 2026, month: 9, method: 'units_of_production', runStatus: 'POSTED', openingNbv: '5000', charge: '125', closingNbv: '4875', accumulated: '125' },
  ],
  accumulated: '125.00', carryingAmount: '4875.00',
};

function signIn(permissions: string[]) {
  useAuthStore.setState({ user: { userId: 'me', permissions, roles: [], featureFlags: { ipsas: true } } as never, loading: false });
}
const wrap = (ui: React.ReactNode) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>,
);

beforeEach(() => {
  [get, post, put].forEach(m => m.mockReset().mockResolvedValue({ data: {} }));
  get.mockImplementation((path: string) => Promise.resolve({ data:
    path === '/api/v1/accounting/periods' ? PERIODS
    : path === '/api/v1/accounting/depreciation-by-class' ? BY_CLASS
    : path === '/api/v1/accounting/assets/a1/depreciation' ? HISTORY
    : [],
  }));
});

describe('PeriodsPage', () => {
  it('lists periods with their runs and previews, and depreciation by class', async () => {
    signIn(['accounting:read']);
    wrap(<PeriodsPage />);
    expect(await screen.findByText('October 2026')).toBeInTheDocument();
    expect(screen.getAllByText('Left out: 1 not recognised (expensed or waiting for Finance)').length).toBeGreaterThan(0);
    const total = (await screen.findByText('Total')).closest('tr')!;
    expect(within(total).getByText(/976\.20/)).toBeInTheDocument();
    expect(screen.queryByText('Post')).not.toBeInTheDocument();
  });

  it('lets an approver post a run someone else prepared, not their own', async () => {
    signIn(['accounting:read', 'accounting:write', 'accounting:approve']);
    wrap(<PeriodsPage />);
    await screen.findByText('November 2026');
    const posts = screen.getAllByRole('button', { name: 'Post' });
    expect(posts[0]).toBeEnabled();     // November: prepared by someone else
    expect(posts[1]).toBeDisabled();    // October: prepared by me
    expect(screen.getByText('You prepared this run, so another approver posts it.')).toBeInTheDocument();
    fireEvent.click(posts[0]);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v1/accounting/runs/r2/post', {}));
  });

  it('opens a period and reverses a posted run with a reason', async () => {
    signIn(['accounting:read', 'accounting:write', 'accounting:approve']);
    wrap(<PeriodsPage />);
    fireEvent.change(await screen.findByLabelText('Month'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2026' } });
    fireEvent.click(screen.getByText('Open period'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v1/accounting/periods', { year: 2026, month: 12 }));
    fireEvent.click(screen.getByText('Reverse'));
    fireEvent.change(screen.getByLabelText('Reason for the reversal'), { target: { value: 'Wrong usage' } });
    fireEvent.click(screen.getByText('Reverse run'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v1/accounting/runs/r0/reverse', { notes: 'Wrong usage' }));
  });
});

describe('AssetDepreciation', () => {
  it('shows posted entries and the carrying amount, and takes usage for an open period', async () => {
    signIn(['accounting:read', 'accounting:write']);
    wrap(<AssetDepreciation assetId="a1" method="units_of_production" />);
    expect(await screen.findByText('Sep 2026')).toBeInTheDocument();
    expect(screen.getByText(/4,875\.00/, { selector: 'strong' })).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText('Usage period'), { target: { value: 'p10' } });
    fireEvent.change(screen.getByLabelText('Units used'), { target: { value: '1000' } });
    fireEvent.click(screen.getByText('Save usage'));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/v1/accounting/periods/p10/usage/a1', { units: 1000 }));
  });
});
