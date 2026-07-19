import { useQuery } from '@tanstack/react-query';

import { useMutationWithToast } from './useMutationWithToast';

import { api } from '@/lib/api';

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

export interface CreateTenantInput {
  organisationName: string;
  loginId?: string;
  adminName: string;
  adminEmail: string;
  adminMode: 'invite' | 'password';
  adminPassword?: string;
}

export interface CreateTenantResult {
  tenantId: string;
  userId: string;
  adminMode: 'invite' | 'password';
  temporaryPassword?: string;
  inviteEmailSent?: boolean;
  inviteEmailError?: string;
}

export function useCreateTenant() {
  return useMutationWithToast<CreateTenantResult, CreateTenantInput>({
    mutationFn: (body) => api.post('/api/v1/admin/platform/tenants', body).then(r => r.data),
    invalidate: ['admin', 'tenants'],
    success: 'Tenant created',
    error: 'Failed to create tenant',
  });
}

export function useDeleteTenant() {
  return useMutationWithToast<{ deletedTenantId: string; deletedSubTenants: string[] }, string>({
    mutationFn: (tenantId) => api.delete(`/api/v1/admin/platform/tenants/${tenantId}`).then(r => r.data),
    invalidate: [['admin', 'tenants'], ['admin', 'users'], ['admin', 'stats']],
    success: 'Tenant permanently deleted',
    error: 'Failed to delete tenant',
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

export function useForcePasswordChange() {
  return useMutationWithToast<{ mustChangePassword: boolean }, { userId: string; mustChangePassword: boolean }>({
    mutationFn: ({ userId, mustChangePassword }) =>
      api.patch(`/api/v1/admin/platform/users/${userId}/force-password-change`, { mustChangePassword }).then(r => r.data),
    invalidate: ['admin', 'users'],
    success: 'Force password change updated',
    error: 'Failed to update force-password-change flag',
  });
}

export function useDisableUserTwoFactor() {
  return useMutationWithToast<{ twoFactorEnabled: boolean }, string>({
    mutationFn: (userId) =>
      api.post(`/api/v1/admin/platform/users/${userId}/two-factor/disable`).then(r => r.data),
    invalidate: ['admin', 'users'],
    success: 'Two-factor authentication disabled',
    error: 'Failed to disable 2FA',
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

export interface UserPermissionsView {
  userId: string;
  rolePermissions: string[];
  overrides: { permission: string; granted: boolean }[];
  effective: string[];
}

export function useUserPermissions(userId: string | undefined) {
  return useQuery<UserPermissionsView>({
    queryKey: ['admin', 'user-permissions', userId],
    queryFn: () => api.get(`/api/v1/admin/platform/users/${userId}/permissions`).then(r => r.data),
    enabled: !!userId,
  });
}

export function useSetUserPermissions() {
  return useMutationWithToast<UserPermissionsView, { userId: string; overrides: { permission: string; granted: boolean }[] }>({
    mutationFn: ({ userId, overrides }) =>
      api.put(`/api/v1/admin/platform/users/${userId}/permissions`, { overrides }).then(r => r.data),
    invalidate: ['admin', 'user-permissions'],
    success: 'Permissions updated',
    error: 'Failed to update permissions',
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

export function useDeleteUser() {
  return useMutationWithToast<unknown, string>({
    mutationFn: (userId) => api.delete(`/api/v1/admin/platform/users/${userId}`).then(r => r.data),
    invalidate: ['admin', 'users'],
    success: 'User deleted',
    error: 'Failed to delete user',
  });
}

// ─── Tenant Onboarding (admin-driven) ───────────────────────────────────────

export interface TenantOnboardingView {
  status: {
    complete: boolean;
    steps: {
      user_registration: boolean;
      company_registration: boolean;
      client_registration: boolean;
      licence_activation: boolean;
    };
    nextStep: string | null;
  };
  user: { id: string; email: string; name: string | null } | null;
  company: {
    legalName: string;
    registrationNumber: string | null;
    addressLine1: string;
    city: string;
    country: string;
  } | null;
  clientCompanies: Array<{
    id: string;
    legalName: string;
    primaryContactEmail: string | null;
    authorities: Array<{ name: string; email: string }>;
  }>;
}

export function useTenantOnboarding(tenantId: string | undefined) {
  return useQuery<TenantOnboardingView>({
    queryKey: ['admin', 'tenant-onboarding', tenantId],
    queryFn: () => api.get(`/api/v1/admin/platform/tenants/${tenantId}/onboarding`).then(r => r.data),
    enabled: !!tenantId,
  });
}

const onboardingInvalidate = (tenantId: string) => ['admin', 'tenant-onboarding', tenantId];

export function useTenantOnboardingUserStep(tenantId: string) {
  return useMutationWithToast<unknown, { name: string; phone?: string }>({
    mutationFn: (body) => api.post(`/api/v1/admin/platform/tenants/${tenantId}/onboarding/user`, body).then(r => r.data),
    invalidate: onboardingInvalidate(tenantId),
    success: 'User details saved',
    error: 'Failed to save user details',
  });
}

export function useTenantOnboardingCompanyStep(tenantId: string) {
  return useMutationWithToast<unknown, { companyName: string; registrationNumber?: string; address: string; city: string; country: string }>({
    mutationFn: (body) => api.post(`/api/v1/admin/platform/tenants/${tenantId}/onboarding/company`, body).then(r => r.data),
    invalidate: onboardingInvalidate(tenantId),
    success: 'Organisation saved',
    error: 'Failed to save organisation',
  });
}

export function useTenantOnboardingClientStep(tenantId: string) {
  return useMutationWithToast<unknown, { clientName: string; contactEmail: string; signatoryName: string; signatoryEmail: string }>({
    mutationFn: (body) => api.post(`/api/v1/admin/platform/tenants/${tenantId}/onboarding/client`, body).then(r => r.data),
    invalidate: onboardingInvalidate(tenantId),
    success: 'Client saved',
    error: 'Failed to save client',
  });
}

export function useCreateSubTenant(tenantId: string) {
  return useMutationWithToast<unknown, {
    clientName: string; contactEmail: string; signatoryName: string; signatoryEmail: string;
    address?: string; city?: string; country?: string; telephone?: string;
  }>({
    mutationFn: (body) => api.post(`/api/v1/admin/platform/tenants/${tenantId}/sub-tenants`, body).then(r => r.data),
    invalidate: [['admin', 'tenant', tenantId], ['admin', 'tenants']],
    success: 'Sub-tenant created',
    error: 'Failed to create sub-tenant',
  });
}

export interface CompanyUpdate {
  legalName?: string;
  registrationNumber?: string;
  addressLine1?: string;
  city?: string;
  country?: string;
  primaryContactName?: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
}

export function useUpdateTenantCompany(tenantId: string) {
  return useMutationWithToast<unknown, CompanyUpdate>({
    mutationFn: (body) => api.patch(`/api/v1/admin/platform/tenants/${tenantId}/company`, body).then(r => r.data),
    invalidate: [['admin', 'tenant', tenantId], ['admin', 'tenants']],
    success: 'Company details updated',
    error: 'Failed to update company details',
  });
}

export function useUploadTenantLogo(tenantId: string) {
  return useMutationWithToast<unknown, File>({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('logo', file);
      return api.post(`/api/v1/admin/platform/tenants/${tenantId}/logo`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data);
    },
    invalidate: [['admin', 'tenant', tenantId]],
    success: 'Logo uploaded',
    error: 'Failed to upload logo',
  });
}

export function useDeleteTenantLogo(tenantId: string) {
  return useMutationWithToast<unknown, void>({
    mutationFn: () => api.delete(`/api/v1/admin/platform/tenants/${tenantId}/logo`).then(r => r.data),
    invalidate: [['admin', 'tenant', tenantId]],
    success: 'Logo removed',
    error: 'Failed to remove logo',
  });
}

export function useTenantOnboardingLicenceStep(tenantId: string) {
  return useMutationWithToast<unknown, { tierName: string }>({
    mutationFn: (body) => api.post(`/api/v1/admin/platform/tenants/${tenantId}/onboarding/licence`, body).then(r => r.data),
    invalidate: onboardingInvalidate(tenantId),
    success: 'Licence activated',
    error: 'Failed to activate licence',
  });
}

export function useTenantOnboardingComplete(tenantId: string) {
  return useMutationWithToast<unknown, void>({
    mutationFn: () => api.post(`/api/v1/admin/platform/tenants/${tenantId}/onboarding/complete`).then(r => r.data),
    invalidate: onboardingInvalidate(tenantId),
    success: 'Onboarding complete',
    error: 'Failed to complete onboarding',
  });
}
