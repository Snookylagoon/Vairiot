import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
    mutationFn: (data: { email: string; name: string; roleId?: string }) =>
      api.post('/api/v1/users', data).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'users'] }); toast.success('Invitation email sent'); },
    onError:   () => { toast.error('Failed to invite user'); },
  });
}

export function useResendInvite() {
  return useMutation({
    mutationFn: (userId: string) =>
      api.post(`/api/v1/users/${userId}/resend-invite`).then(r => r.data),
    onSuccess: () => { toast.success('Invitation resent'); },
    onError:   () => { toast.error('Failed to resend invitation'); },
  });
}

export function useSetUserActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, active }: { userId: string; active: boolean }) =>
      api.patch(`/api/v1/users/${userId}/active`, { active }).then(r => r.data),
    onSuccess: (_data, { active }) => { qc.invalidateQueries({ queryKey: ['admin', 'users'] }); toast.success(active ? 'User enabled' : 'User disabled'); },
    onError:   () => { toast.error('Failed to update user status'); },
  });
}

export function useSetUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) =>
      api.patch(`/api/v1/users/${userId}/role`, { roleId }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'users'] }); toast.success('Role updated'); },
    onError:   () => { toast.error('Failed to update role'); },
  });
}

export interface UserPermissionsView {
  userId: string;
  rolePermissions: string[];
  overrides: { permission: string; granted: boolean }[];
  effective: string[];
}

export function useUserPermissions(userId: string | undefined) {
  return useQuery<UserPermissionsView>({
    queryKey: ['admin', 'user-permissions', userId],
    queryFn: () => api.get(`/api/v1/users/${userId}/permissions`).then(r => r.data),
    enabled: !!userId,
  });
}

export function useSetUserPermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, overrides }: { userId: string; overrides: { permission: string; granted: boolean }[] }) =>
      api.put(`/api/v1/users/${userId}/permissions`, { overrides }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'user-permissions'] }); toast.success('Permissions updated'); },
    onError:   () => { toast.error('Failed to update permissions'); },
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'api-keys'] }); toast.success('API key created'); },
    onError:   () => { toast.error('Failed to create API key'); },
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (keyId: string) => api.delete(`/api/v1/api-keys/${keyId}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'api-keys'] }); toast.success('API key revoked'); },
    onError:   () => { toast.error('Failed to revoke API key'); },
  });
}

export interface AuditEvent {
  id:         string;
  entityType: string;
  entityId:   string;
  action:     string;
  actorId:    string | null;
  occurredAt: string;
  before:     unknown;
  after:      unknown;
  metadata:   { actorKey?: string; email?: string; name?: string; prefix?: string } | null;
  actor:      { name: string; email: string } | null;
}

export function useAuditEvents(entityType?: string) {
  return useQuery<AuditEvent[]>({
    queryKey: ['admin', 'audit-events', entityType ?? 'all'],
    queryFn:  () => api.get('/api/v1/audit-events', {
      params: entityType ? { entityType } : undefined,
    }).then(r => r.data),
  });
}
