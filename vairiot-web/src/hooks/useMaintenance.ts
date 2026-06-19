import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { MaintenanceListResponse, MaintenanceEvent } from '@/types';

export interface MaintenanceListParams {
  assetId?: string; status?: string; page?: number; pageSize?: number;
}

export function useMaintenanceEvents(params: MaintenanceListParams = {}) {
  return useQuery<MaintenanceListResponse>({
    queryKey: ['maintenance', params],
    queryFn: () => api.get('/api/v1/maintenance', { params }).then(r => r.data),
    placeholderData: (prev) => prev,
  });
}

export function useMaintenanceEvent(id: string | undefined) {
  return useQuery<MaintenanceEvent>({
    queryKey: ['maintenance', 'single', id],
    queryFn:  () => api.get(`/api/v1/maintenance/${id}`).then(r => r.data),
    enabled:  !!id,
  });
}

export function useCreateMaintenanceEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/api/v1/maintenance', data).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['maintenance'] }); toast.success('Maintenance event created'); },
    onError: () => { toast.error('Failed to create maintenance event'); },
  });
}

export function useUpdateMaintenanceEvent(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.patch(`/api/v1/maintenance/${id}`, data).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['maintenance'] }); toast.success('Maintenance event updated'); },
    onError: () => { toast.error('Failed to update maintenance event'); },
  });
}

export function useDeleteMaintenanceEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/maintenance/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['maintenance'] }); toast.success('Maintenance event deleted'); },
    onError: () => { toast.error('Failed to delete maintenance event'); },
  });
}
