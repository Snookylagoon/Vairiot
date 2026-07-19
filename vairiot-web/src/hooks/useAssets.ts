import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import type { AssetListResponse, Asset } from '@/types';

export interface AssetListParams {
  search?: string; page?: number; pageSize?: number;
  categoryId?: string; siteId?: string; status?: string; condition?: string;
  sortBy?: string; sortOrder?: string; includeDeleted?: boolean;
}

export function useAssets(params: AssetListParams = {}) {
  return useQuery<AssetListResponse>({
    queryKey: ['assets', params],
    queryFn:  () => api.get('/api/v1/assets', { params }).then(r => r.data),
    placeholderData: (prev) => prev,
  });
}

export function useAsset(id: string) {
  return useQuery<Asset>({
    queryKey: ['asset', id],
    queryFn:  () => api.get(`/api/v1/assets/${id}`).then(r => r.data),
    enabled:  Boolean(id),
  });
}

export function useCreateAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/api/v1/assets', data).then(r => r.data),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['assets'] }); toast.success('Asset created'); },
    onError:    () => { toast.error('Failed to create asset'); },
  });
}

export function useUpdateAsset(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.patch(`/api/v1/assets/${id}`, data).then(r => r.data),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['assets'] }); qc.invalidateQueries({ queryKey: ['asset', id] }); toast.success('Asset updated'); },
    onError:    () => { toast.error('Failed to update asset'); },
  });
}

export function useDeleteAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/assets/${id}`),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['assets'] }); toast.success('Asset archived'); },
    onError:    () => { toast.error('Failed to archive asset'); },
  });
}

export function useDisposeAsset(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post(`/api/v1/assets/${id}/dispose`, data).then(r => r.data),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      qc.invalidateQueries({ queryKey: ['asset', id] });
      toast.success('Asset disposed');
    },
    onError:    () => { toast.error('Failed to dispose asset'); },
  });
}
