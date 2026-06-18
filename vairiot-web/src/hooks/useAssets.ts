import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AssetListResponse, Asset } from '@/types';

export function useAssets(params: { search?: string; page?: number; pageSize?: number; categoryId?: string; siteId?: string } = {}) {
  return useQuery<AssetListResponse>({
    queryKey: ['assets', params],
    queryFn:  () => api.get('/api/v1/assets', { params }).then(r => r.data),
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
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['assets'] }),
  });
}

export function useUpdateAsset(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.patch(`/api/v1/assets/${id}`, data).then(r => r.data),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['assets'] }); qc.invalidateQueries({ queryKey: ['asset', id] }); },
  });
}

export function useDeleteAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/assets/${id}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['assets'] }),
  });
}
