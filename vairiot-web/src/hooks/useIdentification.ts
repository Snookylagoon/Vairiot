import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { api } from '@/lib/api';

export interface Gs1Prefix {
  id: string;
  prefix: string;
  gs1MemberOrg: string;
  licensedOn: string | null;
  capacity: number | null;
  status: 'PENDING' | 'ACTIVE' | 'SUPERSEDED' | 'WITHDRAWN';
  activatedAt: string | null;
  supersededAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface TenantIdentification {
  tenantId: string;
  slug: string;
  tenantMark: string | null;
  mode: 'INTERNAL' | 'GS1';
  filterValue: number;
  allowGiai202: boolean;
  allowInternalPermalock: boolean;
  settlingPeriodDays: number;
  tidSampleRate: number;
  digitalLinkHost: string;
  activePrefix: Gs1Prefix | null;
}

export interface PrefixPreview {
  sampleIar: string;
  sampleGiai: string;
  sampleEpcHex: string;
  sampleDigitalLink: string;
  canonicalDigitalLink: string;
  partition: number | null;
  giaiLength: number;
}

export interface AssetGs1Bundle {
  encoding: {
    mode: 'INTERNAL' | 'GS1';
    scheme: string | null;
    epcHex: string | null;
    giai: string | null;
    hri: string;
    elementString: string;
    digitalLink: string;
    canonicalDigitalLink: string | null;
  } | null;
  bindings: Array<{
    id: string;
    carrierType: string;
    boundAt: string;
    unboundAt: string | null;
    tag: {
      id: string; tidHex: string; epcHex: string | null; epcScheme: string | null;
      state: string; verifiedAt: string | null; chipModel: string | null;
    } | null;
  }>;
  labelPrints: Array<{
    id: string; templateCode: string; symbology: string; payload: string;
    hri: string; printedAt: string; scanVerified: boolean;
  }>;
  events: Array<{
    id: string; seq: number; eventType: string; occurredAt: string; source: string;
  }>;
}

export function useIdentification() {
  return useQuery<TenantIdentification>({
    queryKey: ['identification'],
    queryFn: () => api.get('/api/v1/identification').then(r => r.data),
  });
}

export function useUpdateIdentification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<TenantIdentification>) =>
      api.patch('/api/v1/identification', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['identification'] });
      toast.success('Identification settings saved');
    },
    onError: (e: { response?: { data?: { error?: string } } }) =>
      toast.error(e.response?.data?.error ?? 'Failed to save identification settings'),
  });
}

export function useGs1Prefixes() {
  return useQuery<Gs1Prefix[]>({
    queryKey: ['gs1-prefixes'],
    queryFn: () => api.get('/api/v1/identification/prefixes').then(r => r.data),
  });
}

export function useCreateGs1Prefix() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { prefix: string; gs1MemberOrg: string; licensedOn?: string; capacity?: number; notes?: string }) =>
      api.post('/api/v1/identification/prefixes', data).then(r => r.data as Gs1Prefix & { preview: PrefixPreview }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gs1-prefixes'] });
      toast.success('GS1 prefix registered (pending activation)');
    },
    onError: (e: { response?: { data?: { error?: string } } }) =>
      toast.error(e.response?.data?.error ?? 'Failed to register prefix'),
  });
}

export function usePrefixPreview(prefix: string) {
  return useQuery<PrefixPreview>({
    queryKey: ['gs1-prefix-preview', prefix],
    queryFn: () =>
      api.get('/api/v1/identification/prefixes/preview', { params: { prefix } }).then(r => r.data),
    enabled: /^\d{6,12}$/.test(prefix),
    staleTime: Infinity,
    retry: false,
  });
}

export function useActivateGs1Prefix() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, confirmAssetCount }: { id: string; confirmAssetCount?: number }) =>
      api.post(`/api/v1/identification/prefixes/${id}/activate`, { confirmAssetCount }).then(r => r.data),
    onSuccess: (data: { assetsUpdated: number }) => {
      qc.invalidateQueries({ queryKey: ['gs1-prefixes'] });
      qc.invalidateQueries({ queryKey: ['identification'] });
      qc.invalidateQueries({ queryKey: ['assets'] });
      toast.success(`Prefix activated — ${data.assetsUpdated} assets updated with GIAIs`);
    },
    onError: (e: { response?: { data?: { error?: string } } }) =>
      toast.error(e.response?.data?.error ?? 'Activation failed'),
  });
}

export function useSupersedeGs1Prefix() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/api/v1/identification/prefixes/${id}/supersede`, { reason }).then(r => r.data),
    onSuccess: (data: { assetsUpdated: number; historicGiaisPreserved: number }) => {
      qc.invalidateQueries({ queryKey: ['gs1-prefixes'] });
      qc.invalidateQueries({ queryKey: ['identification'] });
      toast.success(
        `Prefix superseded — ${data.assetsUpdated} assets updated, ${data.historicGiaisPreserved} historic GIAIs preserved`,
      );
    },
    onError: (e: { response?: { data?: { error?: string } } }) =>
      toast.error(e.response?.data?.error ?? 'Supersede failed'),
  });
}

export function useWithdrawGs1Prefix() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post(`/api/v1/identification/prefixes/${id}/withdraw`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gs1-prefixes'] });
      toast.success('Prefix withdrawn');
    },
    onError: () => toast.error('Failed to withdraw prefix'),
  });
}

export function useAssetGs1(assetId: string | undefined) {
  return useQuery<AssetGs1Bundle>({
    queryKey: ['asset-gs1', assetId],
    queryFn: () => api.get(`/api/v1/assets/${assetId}/gs1`).then(r => r.data),
    enabled: !!assetId,
  });
}
