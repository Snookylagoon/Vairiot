import { useQuery } from '@tanstack/react-query';
import type { ModuleKey, ModuleStatus } from 'vairiot-shared';

import { useMutationWithToast } from '@/hooks/useMutationWithToast';
import { api } from '@/lib/api';

/** A tenant's module from the registry, with its state (GET …/tenants/:id/modules, stage 2.2). */
export interface TenantModule {
  key: ModuleKey;
  name: string;
  description: string;
  builtIn: string;
  status: ModuleStatus;
  enabled: boolean;
}

export function useTenantModules(tenantId: string) {
  return useQuery<TenantModule[]>({
    queryKey: ['admin', 'tenant', tenantId, 'modules'],
    queryFn: () => api.get(`/api/v1/admin/platform/tenants/${tenantId}/modules`).then(r => r.data),
    enabled: !!tenantId,
  });
}

export function useSetTenantModule(tenantId: string) {
  return useMutationWithToast<TenantModule[], { key: ModuleKey; enabled: boolean }>({
    mutationFn: ({ key, enabled }) =>
      api.put(`/api/v1/admin/platform/tenants/${tenantId}/modules/${key}`, { enabled }).then(r => r.data),
    invalidate: ['admin', 'tenant', tenantId, 'modules'],
    success: 'Module updated',
    error: 'Could not change the module',
  });
}
