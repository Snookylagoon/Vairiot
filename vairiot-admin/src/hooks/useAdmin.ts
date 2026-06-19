import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMutationWithToast } from './useMutationWithToast';

// ─── Dashboard Stats ────────────────────────────────────────────────────────

export function useDashboardStats() {
  return useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => api.get('/api/v1/admin/platform/stats').then(r => r.data),
    staleTime: 30_000,
  });
}

// ─── Tenants ────────────────────────────────────────────────────────────────

export function useTenants(params: Record<string, string> = {}) {
  return useQuery({
    queryKey: ['admin', 'tenants', params],
    queryFn: () => api.get('/api/v1/admin/platform/tenants', { params }).then(r => r.data),
  });
}

export function useTenantDetail(id: string) {
  return useQuery({
    queryKey: ['admin', 'tenant', id],
    queryFn: () => api.get(`/api/v1/admin/platform/tenants/${id}`).then(r => r.data),
    enabled: !!id,
  });
}

// ─── Cross-Tenant Users ─────────────────────────────────────────────────────

export function useAllUsers(params: Record<string, string> = {}) {
  return useQuery({
    queryKey: ['admin', 'users', params],
    queryFn: () => api.get('/api/v1/admin/platform/users', { params }).then(r => r.data),
  });
}

export function useResetPassword() {
  return useMutationWithToast<{ temporaryPassword: string }, string>({
    mutationFn: (userId) => api.post(`/api/v1/admin/platform/users/${userId}/reset-password`).then(r => r.data),
    invalidate: ['admin', 'users'],
    success: 'Password reset successfully',
    error: 'Failed to reset password',
  });
}

export function useUnlockUser() {
  return useMutationWithToast<unknown, string>({
    mutationFn: (userId) => api.patch(`/api/v1/admin/platform/users/${userId}/unlock`).then(r => r.data),
    invalidate: ['admin', 'users'],
    success: 'User unlocked',
    error: 'Failed to unlock user',
  });
}

export function useSetUserActive() {
  return useMutationWithToast<unknown, { userId: string; active: boolean }>({
    mutationFn: ({ userId, active }) => api.patch(`/api/v1/admin/platform/users/${userId}/active`, { active }).then(r => r.data),
    invalidate: ['admin', 'users'],
    success: 'User status updated',
    error: 'Failed to update user status',
  });
}
