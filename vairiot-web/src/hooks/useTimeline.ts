import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { TimelineEntry } from '@/types';

export function useTimeline(assetId: string) {
  return useQuery<TimelineEntry[]>({
    queryKey: ['timeline', assetId],
    queryFn: () => api.get(`/api/v1/timeline/${assetId}`).then(r => r.data),
    enabled: !!assetId,
  });
}
