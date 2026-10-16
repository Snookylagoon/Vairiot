import { useQuery } from '@tanstack/react-query';

import { useMutationWithToast } from '@/hooks/useMutationWithToast';
import { api } from '@/lib/api';
import { hasFeature, useAuthStore } from '@/stores/auth.store';

/** The tenant's base map (GET /gis/map-settings, stage 1.12). */
export interface MapSettings {
  tileUrl: string;
  attribution: string;
  centreLatitude: number;
  centreLongitude: number;
  zoom: number;
}

export const DEFAULT_BASE_MAP: MapSettings = {
  tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '© OpenStreetMap contributors',
  centreLatitude: 20,
  centreLongitude: 0,
  zoom: 2,
};

/** Base map for every web map; the OpenStreetMap defaults until it loads or with GIS off. */
export function useBaseMap(): MapSettings {
  const gis = useAuthStore(s => hasFeature(s.user, 'gis'));
  const { data } = useQuery<MapSettings>({
    queryKey: ['gis', 'map-settings'],
    queryFn: () => api.get('/api/v1/gis/map-settings').then(r => r.data),
    enabled: gis,
    staleTime: 10 * 60 * 1000,
  });
  return data ?? DEFAULT_BASE_MAP;
}

export function useSaveBaseMap() {
  return useMutationWithToast<MapSettings, MapSettings>({
    mutationFn: (settings) => api.put('/api/v1/gis/map-settings', settings).then(r => r.data),
    invalidate: ['gis', 'map-settings'],
    success: 'Map settings saved',
    error: 'Could not save the map settings',
  });
}
