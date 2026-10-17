import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DEFAULT_CONDITION_SCALE } from 'vairiot-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AssetRecognition } from '@/components/assets/AssetRecognition';
import { AssetForm } from '@/components/forms/AssetForm';
import { accountingDefaults, accountingPayload } from '@/lib/accounting';
import { AssetClassesPage } from '@/pages/accounting/AssetClassesPage';
import { useAuthStore } from '@/stores/auth.store';

// Stage 2.3: asset classes and recognition in the web console.

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();
const patch = vi.fn();
vi.mock('@/lib/api', () => ({ api: {
  get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a),
  put: (...a: unknown[]) => put(...a), patch: (...a: unknown[]) => patch(...a),
} }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const SGN = {
  id: 'c1', code: 'SGN', name: 'Road signs', ipsasClass: 'INFRASTRUCTURE', capitalisationThreshold: '500.00',
  defaultUsefulLifeMonths: 84, defaultDepreciationMethod: 'straight_line', defaultResidualPct: '0', componentisationRequired: false,
  glAssetAccount: '1610', glDepreciationAccount: null, glAccumulatedDepreciationAccount: null, glImpairmentAccount: null,
  toBeConfirmed: true, active: true, assetCount: 3, categoryCount: 1,
};

function signIn(permissions: string[]) {
  useAuthStore.setState({ user: { permissions, roles: [], featureFlags: { ipsas: true } } as never, loading: false });
}
const wrap = (ui: React.ReactNode) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{ui}</MemoryRouter>
  </QueryClientProvider>,
);

beforeEach(() => {
  [get, post, put, patch].forEach(m => m.mockReset().mockResolvedValue({ data: {} }));
  get.mockImplementation((path: string) => Promise.resolve({ data:
    path === '/api/v1/accounting/classes' ? [SGN]
    : path === '/api/v1/categories' ? [{ id: 'k1', name: 'Signs', assetClassId: 'c1' }, { id: 'k2', name: 'Benches', assetClassId: null }]
    : path === '/api/v1/condition/scale' ? { source: 'default', entries: DEFAULT_CONDITION_SCALE }
    : path === '/api/v1/accounting/assets/pending-review' ? [{ id: 'a9', assetNumber: 'AST-9', name: 'Mystery post', reason: 'no_class', category: null }]
    : [],
  }));
});

describe('accounting payload', () => {
  it('sends nothing with the ledger off, and typed values with it on', () => {
    expect(Object.values(accountingPayload({ assetClassId: 'c1' }, false)).every(v => v === undefined)).toBe(true);
    expect(accountingPayload({ assetClassId: '', acquisitionType: 'DONATION', fairValueAtRecognition: '800', sourceEntity: ' City Hall ' }, true))
      .toEqual({ assetClassId: null, acquisitionType: 'DONATION', fairValueAtRecognition: 800, sourceEntity: 'City Hall', recognitionDate: null });
    expect(accountingPayload({ acquisitionType: 'PURCHASE', fairValueAtRecognition: '800', sourceEntity: 'x' }, true))
      .toMatchObject({ fairValueAtRecognition: null, sourceEntity: null });
    expect(accountingDefaults({ recognitionDate: '2026-10-01T00:00:00.000Z' }).recognitionDate).toBe('2026-10-01');
  });
});

describe('AssetClassesPage', () => {
  it('lists classes, flags placeholders and shows what waits for Finance', async () => {
    signIn(['accounting:read', 'accounting:write']);
    wrap(<AssetClassesPage />);
    expect(await screen.findByText('Road signs')).toBeInTheDocument();
    expect(screen.getByText(/1 class has placeholder figures/)).toBeInTheDocument();
    expect(screen.getByText('84 months (7 years)')).toBeInTheDocument();
    const item = (await screen.findByText('Mystery post')).closest('li')!;
    expect(item).toHaveTextContent('No class');
  });

  it('points a category at a class', async () => {
    signIn(['accounting:read', 'accounting:write']);
    wrap(<AssetClassesPage />);
    const select = await screen.findByLabelText('Class for Benches');
    await screen.findByText('Road signs');
    fireEvent.change(select, { target: { value: 'c1' } });
    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/v1/accounting/categories/k2/class', { assetClassId: 'c1' }));
  });

  it('validates a new class with the shared contract before sending it', async () => {
    signIn(['accounting:read', 'accounting:write']);
    wrap(<AssetClassesPage />);
    fireEvent.click(await screen.findByText('New class'));
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'bad code' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Benches' } });
    fireEvent.click(screen.getByText('Save'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/code/);
    expect(post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'BEN' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v1/accounting/classes', expect.objectContaining({ code: 'BEN', name: 'Benches' })));
  });

  it('is read-only without accounting:write', async () => {
    signIn(['accounting:read']);
    wrap(<AssetClassesPage />);
    expect(await screen.findByText('Road signs')).toBeInTheDocument();
    expect(screen.queryByText('New class')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Class for Signs')).toBeDisabled();
  });
});

describe('asset form with the ledger on', () => {
  it('needs a class unless the category has one', async () => {
    signIn(['asset:write']);
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    wrap(<AssetForm onSubmit={onSubmit} defaultValues={{ name: 'Bench', categoryId: 'k2' }} />);
    await screen.findByText('Accounting (IPSAS)');
    fireEvent.click(screen.getByText('Save Asset'));
    expect(await screen.findByText('Choose an asset class, or a category that has one')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('asks for fair value and donor for a donation', async () => {
    signIn(['asset:write']);
    wrap(<AssetForm onSubmit={vi.fn()} defaultValues={{ name: 'Shelter', categoryId: 'k1' }} />);
    expect(await screen.findByText('From category: Road signs')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Acquired by'), { target: { value: 'DONATION' } });
    expect(screen.getByText('Fair value at recognition')).toBeInTheDocument();
    expect(screen.getByText('Donor or transferring entity')).toBeInTheDocument();
  });
});

describe('custodian (stage 2.7)', () => {
  it('is part of the asset form', async () => {
    signIn(['asset:write']);
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    wrap(<AssetForm onSubmit={onSubmit} defaultValues={{ name: 'Cabinet', categoryId: 'k1' }} />);
    await screen.findByText('From category: Road signs'); // the class check needs the category's class
    fireEvent.change(screen.getByLabelText('Custodian'), { target: { value: 'Signals Unit' } });
    fireEvent.click(screen.getByText('Save Asset'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ custodian: 'Signals Unit' })));
  });
});

describe('AssetRecognition', () => {
  const asset = {
    id: 'a1', assetNumber: 'AST-1', name: 'Bracket', status: 'active', condition: 'good', createdAt: '', updatedAt: '',
    assetClassId: 'c1', acquisitionType: 'PURCHASE', capitalisedCost: '200', recognitionStatus: 'EXPENSED' as const, recognitionOverride: false,
  };

  it('shows the standing and lets an approver override with a reason', async () => {
    signIn(['accounting:read', 'accounting:approve']);
    wrap(<AssetRecognition asset={asset} />);
    expect(await screen.findByText('SGN · Road signs')).toBeInTheDocument();
    expect(screen.getByText('Expensed (below threshold)')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Mark as recognised'));
    const save = screen.getByText('Save').closest('button')!;
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Part of a signal network' } });
    fireEvent.click(save);
    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/v1/accounting/assets/a1/recognition', { status: 'RECOGNISED', reason: 'Part of a signal network' }));
  });

  it('offers no override without accounting:approve', async () => {
    signIn(['accounting:read']);
    wrap(<AssetRecognition asset={asset} />);
    await screen.findByText('SGN · Road signs');
    expect(screen.queryByText('Mark as recognised')).not.toBeInTheDocument();
  });
});
