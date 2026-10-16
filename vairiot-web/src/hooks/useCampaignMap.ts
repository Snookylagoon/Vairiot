import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { CampaignMapResponse } from '@/lib/campaignMap';

/** The campaign layer of the asset map; idle until a campaign is chosen. */
export function useCampaignMap(campaignId: string | undefined) {
  return useQuery<CampaignMapResponse>({
    queryKey: ['audits', campaignId, 'map'],
    queryFn: () => api.get(`/api/v1/audits/${campaignId}/map`).then(r => r.data),
    enabled: !!campaignId,
    refetchInterval: 30_000,
  });
}

export interface CampaignOption { id: string; name: string; status: string }

/** Campaigns worth a map layer: running or finished. */
export function useMappableCampaigns() {
  return useQuery<CampaignOption[]>({
    queryKey: ['audits'],
    queryFn: () => api.get('/api/v1/audits').then(r => r.data),
    select: (all) => all.filter(c => c.status === 'in_progress' || c.status === 'completed'),
  });
}
