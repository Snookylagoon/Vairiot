import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ImportPage } from '@/pages/import/ImportPage';
import { useAuthStore } from '@/stores/auth.store';

// Stage 2.14: the staged import wizard.

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();
const patch = vi.fn();
vi.mock('@/lib/api', () => ({ api: {
  get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a), put: (...a: unknown[]) => put(...a), patch: (...a: unknown[]) => patch(...a),
} }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const base = {
  id: 'b1', fileName: 'register.xlsx', mode: 'CREATE', columns: ['Name', 'Cost', 'Asset Class'], mapping: null,
  rowCount: 2, validCount: 0, warningCount: 0, errorCount: 0, committedCount: 0, jobError: null, createdAt: '',
};
let batch: Record<string, unknown> = base;
const ROWS = {
  ERROR: [{ id: 'r1', rowNumber: 2, raw: { Name: 'Lamp', Cost: 'lots', 'Asset Class': 'SGN' }, status: 'ERROR', messages: [{ level: 'error', message: 'Cost: "lots" is not a number' }], assetId: null }],
  PENDING: [] as unknown[],
};

function signIn(permissions: string[]) {
  useAuthStore.setState({ user: { userId: 'me', permissions, roles: [], featureFlags: { ipsas: true } } as never, loading: false });
}
const wrap = (path = '/import?batch=b1') => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}><ImportPage /></MemoryRouter></QueryClientProvider>,
);

beforeEach(() => {
  [get, post, put, patch].forEach(m => m.mockReset().mockResolvedValue({ data: {} }));
  batch = base;
  ROWS.PENDING = [];
  get.mockImplementation((path: string, opts?: { params?: { status?: string } }) => Promise.resolve({ data:
    path === '/api/v1/imports/b1' ? batch
    : path === '/api/v1/imports/b1/rows' ? (() => { const rows = (ROWS as Record<string, unknown[]>)[opts?.params?.status ?? ''] ?? []; return { rows, total: rows.length, page: 1, pageSize: 50 }; })()
    : path === '/api/v1/imports' ? [{ ...base, status: 'COMMITTED', committedCount: 2 }]
    : [],
  }));
  signIn(['asset:read', 'asset:write']);
});

describe('ImportPage', () => {
  it('uploads a file, offering update mode only with accounting:write', async () => {
    post.mockResolvedValue({ data: { ...base, status: 'PARSING' } });
    wrap('/import');
    expect(await screen.findByText('Recent imports')).toBeInTheDocument();
    expect(screen.getByLabelText(/Update existing assets/)).toBeDisabled();
    const file = new File(['x'], 'register.xlsx');
    fireEvent.change(screen.getByLabelText('Register file'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: /Upload/ }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v1/imports', expect.any(FormData)));
    const form = post.mock.calls[0][1] as FormData;
    expect([form.get('file'), form.get('mode')]).toEqual([file, 'CREATE']);
  });

  it('shows the worker at work', async () => {
    batch = { ...base, status: 'VALIDATING' };
    wrap();
    expect(await screen.findByRole('status')).toHaveTextContent('Checking every row…');
  });

  it('guesses the mapping from the headers and checks the rows with it', async () => {
    batch = { ...base, status: 'PARSED' };
    wrap();
    expect(await screen.findByLabelText('Column for Asset name')).toHaveValue('Name');
    expect(screen.getByLabelText('Column for Purchase cost')).toHaveValue('Cost');
    expect(screen.getByLabelText('Column for Asset class code')).toHaveValue('Asset Class');
    fireEvent.change(screen.getByLabelText('Decimal separator'), { target: { value: ',' } });
    fireEvent.click(screen.getByText('Check the rows'));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/v1/imports/b1/mapping', {
      mapping: { fields: { name: 'Name', classCode: 'Asset Class', purchaseCost: 'Cost' }, transforms: { dateFormat: 'DMY', decimalSeparator: ',', lookups: {} } },
    }));
  });

  it('lists the rows to fix with the reasons, and corrects one', async () => {
    batch = { ...base, status: 'VALIDATED', validCount: 1, errorCount: 1, mapping: { fields: { name: 'Name', purchaseCost: 'Cost' } } };
    wrap();
    expect(await screen.findByText('Cost: "lots" is not a number')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Correct'));
    fireEvent.change(screen.getByLabelText('Cost, row 2'), { target: { value: '450' } });
    fireEvent.click(screen.getByText('Save the row'));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/api/v1/imports/b1/rows/r1', { cells: { Cost: '450' } }));
    expect(screen.getByRole('button', { name: 'Import 1 asset' })).toBeEnabled();
  });

  it('asks to check corrected rows again before importing', async () => {
    batch = { ...base, status: 'VALIDATED', validCount: 1, errorCount: 0, mapping: { fields: { name: 'Name' } } };
    ROWS.PENDING = [{ id: 'r1', rowNumber: 2, raw: { Name: 'Lamp' }, status: 'PENDING', messages: [], assetId: null }];
    wrap();
    fireEvent.click(await screen.findByText('Check the rows again'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v1/imports/b1/validate'));
    expect(screen.queryByRole('button', { name: /^Import/ })).not.toBeInTheDocument();
  });

  it('imports the ready rows and then offers the reconciliation sheet', async () => {
    batch = { ...base, status: 'VALIDATED', validCount: 2, warningCount: 1, mapping: { fields: { name: 'Name' } } };
    const { unmount } = wrap();
    fireEvent.click(await screen.findByRole('button', { name: 'Import 3 assets' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v1/imports/b1/commit'));
    unmount();
    batch = { ...base, status: 'COMMITTED', committedCount: 3, errorCount: 1 };
    wrap();
    expect(await screen.findByText(/3 assets imported; 1 rows left out/)).toBeInTheDocument();
    get.mockResolvedValueOnce({ data: new Blob(['x']) });
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
    globalThis.URL.revokeObjectURL = vi.fn();
    fireEvent.click(screen.getByText('Download the reconciliation sheet'));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/v1/imports/b1/reconciliation.xlsx', { responseType: 'blob' }));
  });

  it('says why a step failed', async () => {
    batch = { ...base, status: 'FAILED', rowCount: 0, jobError: 'The file could not be read as .xlsx' };
    wrap();
    expect(within(await screen.findByRole('alert')).getByText(/could not be read/)).toBeInTheDocument();
  });
});
