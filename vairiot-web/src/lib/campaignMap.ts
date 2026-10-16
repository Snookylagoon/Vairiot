import type { AssetMapPoint } from '@/types';

/** States of the campaign layer (GET /audits/:id/map, stage 1.10). */
export const CAMPAIGN_STATE_COLOURS = {
  verified:           { label: 'Verified',           colour: '#16a34a' },
  misplaced:          { label: 'Misplaced',          colour: '#d97706' },
  condition_variance: { label: 'Condition variance', colour: '#a05b97' },
  missing:            { label: 'Missing',            colour: '#dc2626' },
  surplus:            { label: 'Surplus tag',        colour: '#2563eb' },
  scanned:            { label: 'Scanned',            colour: '#615aa0' },
  not_scanned:        { label: 'Not yet scanned',    colour: '#9ca3af' },
} as const;
export type CampaignMapState = keyof typeof CAMPAIGN_STATE_COLOURS;

export interface CampaignMapPoint {
  id: string;
  assetId: string | null;
  assetNumber: string | null;
  name: string;
  state: CampaignMapState;
  latitude: number;
  longitude: number;
  geoAccuracyMeters: number | null;
  positionSource: 'register' | 'scan';
}

export interface CampaignMapResponse {
  campaign: { id: string; name: string; mode: string; status: string };
  points: CampaignMapPoint[];
  counts: Record<CampaignMapState, number>;
  unplaced: number;
}

export function stateColour(state: string): string {
  return (CAMPAIGN_STATE_COLOURS as Record<string, { colour: string }>)[state]?.colour ?? CAMPAIGN_STATE_COLOURS.not_scanned.colour;
}

export function stateLabel(state: string): string {
  return (CAMPAIGN_STATE_COLOURS as Record<string, { label: string }>)[state]?.label ?? state;
}

/** The cluster map draws AssetMapPoints; a campaign point carries its state in `status`. */
export function toAssetMapPoint(p: CampaignMapPoint): AssetMapPoint {
  return {
    id: p.id, assetNumber: p.assetNumber ?? p.name, name: p.name, status: p.state, condition: '',
    latitude: p.latitude, longitude: p.longitude, geoAccuracyMeters: p.geoAccuracyMeters,
    category: null, site: null, location: null,
  };
}
