import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TenantModulesCard } from '@/components/tenants/TenantModulesCard';
import { useAuthStore } from '@/stores/auth.store';

// The platform console's module switches (stage 2.2): first admin tests (D8).

const get = vi.fn();
const put = vi.fn();
vi.mock('@/lib/api', () => ({ api: { get: (...a: unknown[]) => get(...a), put: (...a: unknown[]) => put(...a) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const MODULES = [
  { key: 'gis', name: 'GIS', description: 'Maps.', builtIn: 'S1', status: 'available', enabled: true },
  { key: 'ipsas', name: 'IPSAS ledger', description: 'Ledger.', builtIn: 'S2', status: 'in_development', enabled: false },
];

function renderCard(roles: string[]) {
  useAuthStore.setState({ user: { roles } as never, loading: false });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TenantModulesCard tenantId="tuda" />
    </QueryClientProvider>,
  );
}

describe('TenantModulesCard', () => {
  beforeEach(() => {
    get.mockReset().mockResolvedValue({ data: MODULES });
    put.mockReset().mockResolvedValue({ data: MODULES });
  });

  it('lists the modules with their state', async () => {
    renderCard(['Platform Super Admin']);
    expect(await screen.findByRole('switch', { name: 'GIS module' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'IPSAS ledger module' })).not.toBeChecked();
    expect(screen.getByText('In development')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/api/v1/admin/platform/tenants/tuda/modules');
  });

  it('switches a module on straight away', async () => {
    renderCard(['Platform Super Admin']);
    fireEvent.click(await screen.findByRole('switch', { name: 'IPSAS ledger module' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/v1/admin/platform/tenants/tuda/modules/ipsas', { enabled: true }));
  });

  it('asks before switching one off', async () => {
    renderCard(['Platform Super Admin']);
    fireEvent.click(await screen.findByRole('switch', { name: 'GIS module' }));
    expect(put).not.toHaveBeenCalled();
    expect(screen.getByText('Switch off GIS?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Switch off' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/v1/admin/platform/tenants/tuda/modules/gis', { enabled: false }));
  });

  it('is read-only for the Licensing Authority', async () => {
    renderCard(['Licensing Authority']);
    expect(await screen.findByRole('switch', { name: 'GIS module' })).toBeDisabled();
    expect(screen.getByText('Only a Platform Super Admin can switch modules.')).toBeInTheDocument();
  });
});
