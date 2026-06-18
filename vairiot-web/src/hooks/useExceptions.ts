import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ExceptionsData } from '@/types';

export function useExceptions() {
  return useQuery<ExceptionsData>({
    queryKey: ['exceptions'],
    queryFn: () => api.get('/api/v1/exceptions').then(r => r.data),
  });
}
