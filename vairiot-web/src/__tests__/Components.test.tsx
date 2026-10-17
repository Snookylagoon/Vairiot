import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AssetComponents } from '@/components/assets/AssetComponents';
import { AssetsPage } from '@/pages/assets/AssetsPage';
import { useAuthStore } from '@/stores/auth.store';

// Stage 2.6: assets held as parts in the web console.

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();
vi.mock('@/lib/api', () => ({ api: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a), put: (...a: unknown[]) => put(...a) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const dep = (c: number, n: number) => ({ capitalizedCost: c, accumulatedDepreciation: c - n, netBookValue: n });
const member = (id: string, name: string, role: string | null, c: number, n: number) =>
  ({ id, assetNumber: `AST-${id}`, name, status: 'active', componentRole: role, capitalisedCost: String(c), recognitionStatus: 'RECOGNISED', depreciation: dep(c, n) });
const GROUP = {
  asset: member('1', 'Junction', null, 0, 0), parent: null,
  components: [member('2', 'Junction — Controller', 'controller', 7000, 6000), member('3', 'Junction — Poles', 'pole', 5000, 4800)],
  rollUp: dep(12000, 10800),
};
const TEMPLATES = [{ id: 't1', code: 'JUNCTION', name: 'Signalised junction', active: true, toBeConfirmed: true, assetClass: null, lines: [{}, {}, {}, {}] }];

function signIn(permissions: string[]) {
  useAuthStore.setState({ user: { permissions, roles: [], featureFlags: { ipsas: true } } as never, loading: false });
}
const wrap = (ui: React.ReactNode, url = '/') => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>
  </QueryClientProvider>,
);

beforeEach(() => {
  [get, post, put].forEach(m => m.mockReset().mockResolvedValue({ data: {} }));
  get.mockImplementation((path: string, opts?: { params?: Record<string, unknown> }) => Promise.resolve({ data:
    path === '/api/v1/accounting/assets/1/components' ? GROUP
    : path === '/api/v1/accounting/assets/2/components' ? { ...GROUP, asset: GROUP.components[0], parent: { id: '1', assetNumber: 'AST-1', name: 'Junction' }, components: [], rollUp: null }
    : path === '/api/v1/accounting/component-templates' ? TEMPLATES
    : path === '/api/v1/assets' ? {
      assets: opts?.params?.rollUp ? [] : [
        { id: '1', assetNumber: 'AST-1', name: 'Junction', status: 'active', condition: 'good', _count: { components: 2 } },
        { id: '2', assetNumber: 'AST-2', name: 'Junction — Controller', status: 'active', condition: 'good', parentAsset: { id: '1', assetNumber: 'AST-1', name: 'Junction' }, _count: { components: 0 } },
      ], total: 2, page: 1, pageSize: 25, totalPages: 1,
    }
    : [],
  }));
});

describe('AssetComponents', () => {
  it('lists the parts with the whole asset’s roll-up', async () => {
    signIn(['accounting:read']);
    wrap(<AssetComponents assetId="1" assetName="Junction" />);
    expect(await screen.findByText('Components (2)')).toBeInTheDocument();
    expect(screen.getByText('Junction — Controller')).toBeInTheDocument();
    const whole = screen.getByText('Whole asset (own + parts)').closest('tr')!;
    expect(within(whole).getByText(/12,000/)).toBeInTheDocument();
    expect(screen.queryByText('Add part')).not.toBeInTheDocument();
  });

  it('adds a template’s parts to this asset', async () => {
    signIn(['accounting:read', 'accounting:write', 'asset:write']);
    wrap(<AssetComponents assetId="1" assetName="Junction" />);
    fireEvent.click(await screen.findByText('Add from template'));
    fireEvent.change(screen.getByLabelText('Component template'), { target: { value: 't1' } });
    fireEvent.change(screen.getByLabelText('Total cost of the parts'), { target: { value: '20000' } });
    fireEvent.click(screen.getByText('Add parts'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v1/accounting/component-templates/t1/assets',
      { name: 'Junction', parentAssetId: '1', totalCost: 20000 }));
  });

  it('adds a part by hand and detaches one', async () => {
    signIn(['accounting:read', 'accounting:write', 'asset:write']);
    wrap(<AssetComponents assetId="1" assetName="Junction" />);
    fireEvent.click(await screen.findByText('Add part'));
    fireEvent.change(screen.getByLabelText('Part name'), { target: { value: 'Cabinet' } });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'cabinet' } });
    fireEvent.click(screen.getByText('Add'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v1/assets', expect.objectContaining({ name: 'Cabinet', parentAssetId: '1', componentRole: 'cabinet' })));
    fireEvent.click(screen.getAllByText('Detach')[0]);
    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/v1/accounting/assets/2/parent', { parentAssetId: null }));
  });

  it('shows a part the asset it belongs to', async () => {
    signIn(['accounting:read']);
    wrap(<AssetComponents assetId="2" assetName="Junction — Controller" />);
    expect((await screen.findByText('AST-1 · Junction')).closest('a')).toHaveAttribute('href', '/assets/1');
  });
});

describe('register list', () => {
  it('marks parents and parts, and rolls parts up on request', async () => {
    signIn(['asset:read']);
    wrap(<AssetsPage />, '/assets');
    expect(await screen.findByLabelText('2 components')).toBeInTheDocument();
    expect(screen.getByLabelText('Part of AST-1')).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Filters/));
    fireEvent.click(await screen.findByLabelText('Roll up components'));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/v1/assets', { params: expect.objectContaining({ rollUp: true }) }));
  });
});
