import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  roles: { role: { id: string; name: string } }[];
}

export interface AdminRole {
  id: string;
  name: string;
  permissions: string[];
  isSystem: boolean;
}

export interface AdminApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdBy: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export function useUsers() {
  return useQuery<AdminUser[]>({
    queryKey: ['admin', 'users'],
    queryFn:  () => api.get('/api/v1/users').then(r => r.data),
  });
}

export function useRoles() {
  return useQuery<AdminRole[]>({
    queryKey: ['admin', 'roles'],
    queryFn:  () => api.get('/api/v1/users/roles').then(r => r.data),
  });
}

export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { email: string; name: string; password: string; roleId?: string }) =>
      api.post('/api/v1/users', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export function useSetUserActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, active }: { userId: string; active: boolean }) =>
      api.patch(`/api/v1/users/${userId}/active`, { active }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export function useSetUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) =>
      api.patch(`/api/v1/users/${userId}/role`, { roleId }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export function useApiKeys() {
  return useQuery<AdminApiKey[]>({
    queryKey: ['admin', 'api-keys'],
    queryFn:  () => api.get('/api/v1/api-keys').then(r => r.data),
  });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation<
    { id: string; name: string; prefix: string; scopes: string[]; createdAt: string; token: string },
    Error,
    { name: string; scopes?: string[] }
  >({
    mutationFn: (data) => api.post('/api/v1/api-keys', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'api-keys'] }),
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (keyId: string) => api.delete(`/api/v1/api-keys/${keyId}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'api-keys'] }),
  });
}
