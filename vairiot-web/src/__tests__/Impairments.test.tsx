import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AssetImpairments } from '@/components/assets/AssetImpairments';
import { ImpairmentsPage } from '@/pages/accounting/ImpairmentsPage';
import { useAuthStore } from '@/stores/auth.store';

// Stage 2.12: impairment in the web console.

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();
vi.mock('@/lib/api', () => ({ api: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a), put: (...a: unknown[]) => put(...a) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const asset = { id: 'a1', assetNumber: 'SGN-001', name: 'Sign' };
const record = (over: Record<string, unknown>) => ({
  id: 'i1', assetId: 'a1', kind: 'IMPAIRMENT', status: 'DRAFT', indicator: 'CONDITION', indicatorNotes: 'Grade 4 → 1', conditionGrade: 1,
  standard: null, method: null, carryingAmount: null, recoverableAmount: null, loss: null, assessmentNotes: null, correctionOfId: null,
  raisedBy: 'me', assessedBy: null, postedBy: null, postedAt: null, createdAt: '', asset, period: null, ...over,
});
const DRAFT = record({});
const ASSESSED = record({ id: 'i2', standard: 'IPSAS_21', method: 'DRC', carryingAmount: '988.1', recoverableAmount: '600', loss: '388.1', assessedBy: 'someone-else' });
const POSTED = record({ id: 'i3', status: 'POSTED', standard: 'IPSAS_21', method: 'DRC', carryingAmount: '988.1', recoverableAmount: '600', loss: '388.1', period: { year: 2026, month: 10 } });
const PERIODS = [{ id: 'p11', year: 2026, month: 11, status: 'OPEN', runs: [] }, { id: 'p10', year: 2026, month: 10, status: 'CLOSED', runs: [] }];
const REGISTER = { rows: [], totals: { count: 1, losses: '388.10', reversals: '0.00', net: '388.10' } };

function signIn(permissions: string[]) {
  useAuthStore.setState({ user: { userId: 'me', permissions, roles: [], featureFlags: { ipsas: true } } as never, loading: false });
}
const wrap = (ui: React.ReactNode) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>,
);

beforeEach(() => {
  [get, post, put].forEach(m => m.mockReset().mockResolvedValue({ data: {} }));
  get.mockImplementation((path: string, opts?: { params?: { status?: string; assetId?: string } }) => Promise.resolve({ data:
    path === '/api/v1/accounting/impairments' ? (opts?.params?.status === 'DRAFT' ? [DRAFT, ASSESSED] : [DRAFT, ASSESSED, POSTED])
    : path === '/api/v1/accounting/periods' ? PERIODS
    : path === '/api/v1/accounting/impairment-register' ? REGISTER
    : [],
  }));
});

describe('ImpairmentsPage', () => {
  it('assesses a draft with the standard, method and recoverable amount', async () => {
    signIn(['accounting:read', 'accounting:write']);
    wrap(<ImpairmentsPage />);
    const card = (await screen.findAllByLabelText('Impairment of SGN-001'))[0];
    fireEvent.change(within(card).getByLabelText('Measurement method'), { target: { value: 'SERVICE_UNITS' } });
    fireEvent.change(within(card).getByLabelText('Recoverable amount'), { target: { value: '600' } });
    fireEvent.click(within(card).getByText('Save assessment'));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/v1/accounting/impairments/i1/assessment', { standard: 'IPSAS_21', method: 'SERVICE_UNITS', recoverableAmount: 600 }));
    expect(screen.queryByText('Post')).not.toBeInTheDocument(); // no accounting:approve
  });

  it('lets another approver post an assessed draft into an open month', async () => {
    signIn(['accounting:read', 'accounting:write', 'accounting:approve']);
    wrap(<ImpairmentsPage />);
    expect(await screen.findByText(/impairment loss of/)).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText('Post into'), { target: { value: 'p11' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v1/accounting/impairments/i2/post', { periodId: 'p11' }));
    expect(screen.getByRole('option', { name: 'November 2026' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'October 2026' })).not.toBeInTheDocument(); // closed
  });

  it('shows posted records with the net total, and corrects one with a reason', async () => {
    signIn(['accounting:read', 'accounting:approve']);
    wrap(<ImpairmentsPage />);
    fireEvent.click(await screen.findByText('Correct'));
    fireEvent.change(await screen.findByLabelText('Correct in'), { target: { value: 'p11' } });
    fireEvent.change(screen.getByLabelText('Reason for the correction'), { target: { value: 'Wrong recoverable amount' } });
    fireEvent.click(screen.getByText('Post correction'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v1/accounting/impairments/i3/correct', { periodId: 'p11', notes: 'Wrong recoverable amount' }));
    expect(screen.getByText(/Losses .*388\.10/)).toBeInTheDocument();
  });

  it('dismisses a draft', async () => {
    signIn(['accounting:read', 'accounting:write']);
    wrap(<ImpairmentsPage />);
    fireEvent.click((await screen.findAllByText('Dismiss'))[0]);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v1/accounting/impairments/i1/dismiss', {}));
  });
});

describe('AssetImpairments', () => {
  it('lists the asset’s impairments and raises one by hand', async () => {
    signIn(['accounting:read', 'accounting:write']);
    get.mockImplementation(() => Promise.resolve({ data: [POSTED] }));
    wrap(<AssetImpairments assetId="a1" recognised />);
    expect(await screen.findByText(/Net impairment/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Raise an impairment'));
    fireEvent.change(screen.getByLabelText('Indicator'), { target: { value: 'OBSOLESCENCE' } });
    fireEvent.change(screen.getByLabelText('What indicates it'), { target: { value: 'Superseded model' } });
    fireEvent.click(screen.getByText('Raise'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v1/accounting/impairments', { assetId: 'a1', indicator: 'OBSOLESCENCE', indicatorNotes: 'Superseded model' }));
  });

  it('points a waiting draft to the Impairment page and offers nothing for an unrecognised asset', async () => {
    signIn(['accounting:read', 'accounting:write']);
    get.mockImplementation(() => Promise.resolve({ data: [DRAFT] }));
    const { unmount } = wrap(<AssetImpairments assetId="a1" recognised />);
    expect(await screen.findByText('Assess it on the Impairment page')).toBeInTheDocument();
    expect(screen.queryByText('Raise an impairment')).not.toBeInTheDocument();
    unmount();
    get.mockImplementation(() => Promise.resolve({ data: [] }));
    const { container } = wrap(<AssetImpairments assetId="a1" recognised={false} />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
