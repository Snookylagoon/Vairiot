import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Site } from '@/types';

export function useSites() {
  return useQuery<Site[]>({
    queryKey: ['sites'],
    queryFn:  () => api.get('/api/v1/sites').then(r => r.data),
  });
}

export function useCreateSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; address?: string; city?: string; country?: string }) =>
      api.post('/api/v1/sites', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sites'] }),
  });
}
