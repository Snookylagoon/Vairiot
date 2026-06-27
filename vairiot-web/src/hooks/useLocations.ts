import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';

interface Location {
  id: string;
  name: string;
  type: string;
}

export function useLocations(siteId?: string) {
  return useQuery<Location[]>({
    queryKey: ['locations', siteId],
    queryFn:  () => api.get(`/api/v1/sites/${siteId}/locations`).then(r => r.data),
    enabled:  !!siteId,
  });
}

export function useCreateLocation(siteId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string }) =>
      api.post(`/api/v1/sites/${siteId}/locations`, data).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['locations', siteId] }); toast.success('Location created'); },
    onError:   () => { toast.error('Failed to create location'); },
  });
}
