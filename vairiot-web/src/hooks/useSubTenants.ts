import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SubTenantCompanyInput {
  legalName:            string;
  tradingName?:         string;
  registrationNumber?:  string;
  addressLine1?:        string;
  addressLine2?:        string;
  city?:                string;
  stateProvince?:       string;
  postalCode?:          string;
  country?:             string;
  primaryContactName?:  string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
  currency?:            string;
}

export interface CreateSubTenantInput {
  organisationName: string;
  loginId?:         string;
  company:          SubTenantCompanyInput;
}

export interface SubTenantSummary {
  id:                 string;
  name:               string;
  active:             boolean;
  onboardingComplete: boolean;
  createdAt:          string;
  company: null | {
    legalName:            string;
    tradingName:          string | null;
    city:                 string | null;
    country:              string | null;
    primaryContactName:   string | null;
    primaryContactEmail:  string | null;
    logoStorageKey:       string | null;
    currency:             string | null;
  };
  _count: { assets: number; users: number };
}

export interface SubTenantDetail {
  id:                 string;
  name:               string;
  active:             boolean;
  onboardingComplete: boolean;
  parentTenantId:     string | null;
  deploymentMode:     string;
  createdAt:          string;
  updatedAt:          string;
  company: null | {
    tenantId:             string;
    legalName:            string;
    tradingName:          string | null;
    registrationNumber:   string | null;
    addressLine1:         string | null;
    addressLine2:         string | null;
    city:                 string | null;
    stateProvince:        string | null;
    postalCode:           string | null;
    country:              string | null;
    primaryContactName:   string | null;
    primaryContactEmail:  string | null;
    primaryContactPhone:  string | null;
    logoStorageKey:       string | null;
    currency:             string | null;
  };
  _count: { assets: number; users: number };
}

// ─── Queries ────────────────────────────────────────────────────────────────

export function useSubTenants() {
  return useQuery<SubTenantSummary[]>({
    queryKey: ['sub-tenants'],
    queryFn:  () => api.get('/api/v1/company/sub-tenants').then(r => r.data),
  });
}

export function useSubTenant(id: string | undefined) {
  return useQuery<SubTenantDetail>({
    queryKey: ['sub-tenants', id],
    queryFn:  () => api.get(`/api/v1/company/sub-tenants/${id}`).then(r => r.data),
    enabled: !!id,
  });
}

// ─── Mutations ──────────────────────────────────────────────────────────────

export function useCreateSubTenant() {
  const qc = useQueryClient();
  return useMutation<SubTenantDetail, unknown, CreateSubTenantInput>({
    mutationFn: (data) => api.post('/api/v1/company/sub-tenants', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sub-tenants'] });
      toast.success('Sub-tenant created');
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.error ?? 'Failed to create sub-tenant';
      toast.error(msg);
    },
  });
}

export function useUpdateSubTenantCompany(id: string) {
  const qc = useQueryClient();
  return useMutation<unknown, unknown, Partial<SubTenantCompanyInput>>({
    mutationFn: (data) => api.patch(`/api/v1/company/sub-tenants/${id}/company`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sub-tenants'] });
      qc.invalidateQueries({ queryKey: ['sub-tenants', id] });
      toast.success('Sub-tenant updated');
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.error ?? 'Failed to update sub-tenant';
      toast.error(msg);
    },
  });
}

export function useUploadSubTenantLogo(id: string) {
  const qc = useQueryClient();
  return useMutation<unknown, unknown, File>({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('logo', file);
      return api.post(`/api/v1/company/sub-tenants/${id}/logo`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sub-tenants', id] });
      toast.success('Logo uploaded');
    },
    onError: () => toast.error('Failed to upload logo'),
  });
}

export function useDeleteSubTenantLogo(id: string) {
  const qc = useQueryClient();
  return useMutation<unknown, unknown, void>({
    mutationFn: () => api.delete(`/api/v1/company/sub-tenants/${id}/logo`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sub-tenants', id] });
      toast.success('Logo removed');
    },
    onError: () => toast.error('Failed to remove logo'),
  });
}

// ─── Utilities ──────────────────────────────────────────────────────────────

export function slugifyLoginId(source: string): string {
  return source
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}
