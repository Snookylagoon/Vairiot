import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { TransferListResponse } from '@/types';

export interface TransferListParams {
  assetId?: string; page?: number; pageSize?: number;
}

export function useTransfers(params: TransferListParams = {}) {
  return useQuery<TransferListResponse>({
    queryKey: ['transfers', params],
    queryFn: () => api.get('/api/v1/transfers', { params }).then(r => r.data),
    placeholderData: (prev) => prev,
  });
}

export function useCreateTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/api/v1/transfers', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfers'] });
      qc.invalidateQueries({ queryKey: ['assets'] });
      toast.success('Transfer recorded');
    },
    onError: () => { toast.error('Failed to create transfer'); },
  });
}
