export const CampaignStatus = {
  Draft:      'draft',
  InProgress: 'in_progress',
  Completed:  'completed',
} as const;
export type CampaignStatus = (typeof CampaignStatus)[keyof typeof CampaignStatus];

export const ScanResult = {
  Found:   'found',
  Unknown: 'unknown',
} as const;
export type ScanResult = (typeof ScanResult)[keyof typeof ScanResult];
