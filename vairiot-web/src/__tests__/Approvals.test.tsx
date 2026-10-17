import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApprovalBadge } from '@/components/approvals/ApprovalBadge';
import { AwaitingApproval } from '@/components/approvals/AwaitingApproval';
import { useDisposeAsset } from '@/hooks/useAssets';
import { ApprovalsPage } from '@/pages/approvals/ApprovalsPage';
import { useAuthStore } from '@/stores/auth.store';

// Stage 3.3: maker-checker approvals in the web console (S3.1, D22).

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();
vi.mock('@/lib/api', () => ({ api: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a), put: (...a: unknown[]) => put(...a) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const request = (over: Record<string, unknown>) => ({
  id: 'r1', action: 'DISPOSE', status: 'PENDING', assetId: 'a1', entityType: 'Asset', entityId: 'a1',
  payload: { assetId: 'a1', disposalMethod: 'SCRAPPED', disposalValue: 0 }, amount: '988.10', summary: 'Dispose of SGN-001 Sign (SCRAPPED)',
  requestedBy: 'operator', requestedByName: 'Nino', decidedBy: null, decidedByName: null, decidedAt: null, reason: null, error: null,
  approverRole: 'Finance', canDecide: true, createdAt: '2026-10-17T09:00:00Z', ...over,
});
const PENDING = request({});
const INBOX = {
  requests: [PENDING],
  runs: [{ id: 'run-oct', assetCount: 12, totalCharge: '142.8', period: { id: 'p10', year: 2026, month: 10 }, preparedBy: 'x', createdAt: '' }],
  impairments: [], count: 2,
};
const ROLES = [{ id: 'role-fin', name: 'Finance' }, { id: 'role-inv', name: 'Inventory Manager' }];
const RULES = [{ id: 'rule1', action: 'DISPOSE', minAmount: '0', approverRoleId: 'role-fin', requireDifferentUser: true, active: true, role: ROLES[0] }];
let mine: unknown[] = [];

function signIn(permissions: string[], userId = 'finance') {
  useAuthStore.setState({ user: { userId, permissions, roles: [], featureFlags: { ipsas: true } } as never, loading: false });
}
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={client()}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);

beforeEach(() => {
  [get, post, put].forEach(m => m.mockReset().mockResolvedValue({ data: {} }));
  mine = [];
  get.mockImplementation((path: string) => Promise.resolve({ data:
    path === '/api/v1/approvals/inbox' ? INBOX
    : path === '/api/v1/approvals/mine' ? mine
    : path === '/api/v1/approvals' ? [PENDING]
    : path === '/api/v1/approvals/rules' ? RULES
    : path === '/api/v1/users/roles' ? ROLES
    : [],
  }));
});

describe('ApprovalsPage', () => {
  it('lists what the approver may decide, with what will change, and approves it', async () => {
    signIn(['approval:read', 'approval:decide', 'accounting:approve']);
    post.mockResolvedValue({ data: { ...PENDING, status: 'APPROVED' } });
    wrap(<ApprovalsPage />);
    const card = await screen.findByLabelText(`Request: ${PENDING.summary}`);
    expect(within(card).getByText(/Asked by Nino/)).toHaveTextContent('for Finance');
    const changes = within(card).getByLabelText('What will change');
    expect(changes).toHaveTextContent('Disposal Method');
    expect(changes).toHaveTextContent('SCRAPPED');
    expect(changes).not.toHaveTextContent('a1'); // ids are left out
    expect(screen.getByText(/Depreciation run for October 2026: 12 assets/)).toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v1/approvals/r1/approve', {}));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Approved and done'));
  });

  it('needs a reason to reject', async () => {
    signIn(['approval:read', 'approval:decide']);
    post.mockResolvedValue({ data: { ...PENDING, status: 'REJECTED' } });
    wrap(<ApprovalsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reject…' }));
    const reject = screen.getByRole('button', { name: 'Reject' });
    expect(reject).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Reason for rejecting'), { target: { value: 'Still in use at Rustaveli' } });
    fireEvent.click(reject);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v1/approvals/r1/reject', { reason: 'Still in use at Rustaveli' }));
  });

  it('shows a requester their own requests, awaiting the role, and withdraws one', async () => {
    signIn(['asset:read', 'asset:write'], 'operator');
    mine = [PENDING, request({ id: 'r2', status: 'REJECTED', summary: 'Transfer SGN-002', reason: 'Wrong custodian', decidedByName: 'Tamar' })];
    wrap(<ApprovalsPage />);
    expect(screen.queryByText('For you to decide')).not.toBeInTheDocument();
    const row = await screen.findByLabelText(`My request: ${PENDING.summary}`);
    expect(within(row).getByText('Awaiting Finance')).toBeInTheDocument();
    expect(screen.getByText('Tamar: Wrong custodian')).toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v1/approvals/r1/cancel'));
    expect(get).not.toHaveBeenCalledWith('/api/v1/approvals/inbox');
  });

  it('lets company:manage add a tier, keeping disposal never self-approved', async () => {
    signIn(['company:manage', 'approval:read']);
    put.mockResolvedValue({ data: RULES });
    wrap(<ApprovalsPage />);
    const rules = await screen.findByLabelText('Approval rules');
    await within(rules).findByDisplayValue('Disposal');
    expect(within(rules).getByLabelText('Not by the requester, rule 1')).toBeDisabled();
    fireEvent.click(within(rules).getByText('Add a rule'));
    fireEvent.change(within(rules).getByLabelText('Action of rule 2'), { target: { value: 'WRITE_OFF' } });
    fireEvent.change(within(rules).getByLabelText('From amount of rule 2'), { target: { value: '5000' } });
    fireEvent.change(within(rules).getByLabelText('Role of rule 2'), { target: { value: 'role-fin' } });
    fireEvent.click(within(rules).getByText('Save rules'));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/v1/approvals/rules', { rules: [
      { action: 'DISPOSE', minAmount: 0, approverRoleId: 'role-fin', requireDifferentUser: true, active: true },
      { action: 'WRITE_OFF', minAmount: 5000, approverRoleId: 'role-fin', requireDifferentUser: true, active: true },
    ] }));
  });
});

describe('the badge and the banner', () => {
  it('counts what waits for an approver, and is absent for others', async () => {
    signIn(['approval:decide']);
    const { unmount } = wrap(<ApprovalBadge />);
    expect(await screen.findByLabelText('2 waiting for your approval')).toHaveTextContent('2');
    unmount();
    signIn(['asset:read']);
    wrap(<ApprovalBadge />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows "awaiting approval" on the asset to its requester', async () => {
    signIn(['asset:read', 'asset:write'], 'operator');
    mine = [request({ canDecide: false }), request({ id: 'r9', assetId: 'other', summary: 'Elsewhere' })];
    wrap(<AwaitingApproval assetId="a1" />);
    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent('Awaiting approval');
    expect(banner).toHaveTextContent('Nothing changes until it is approved.');
    expect(banner).not.toHaveTextContent('Elsewhere');
  });
});

describe('a gated action', () => {
  it('says the disposal was sent for approval when the API answers 202', async () => {
    post.mockResolvedValue({ status: 202, data: { approvalRequest: PENDING } });
    const { result } = renderHook(() => useDisposeAsset('a1'), {
      wrapper: ({ children }) => <QueryClientProvider client={client()}>{children}</QueryClientProvider>,
    });
    await act(() => result.current.mutateAsync({ disposalMethod: 'SCRAPPED' }));
    expect(toast.success).toHaveBeenCalledWith('Sent for approval: nothing changes until it is approved');
  });
});
