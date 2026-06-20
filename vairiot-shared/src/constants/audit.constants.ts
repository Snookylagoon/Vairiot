export const CampaignStatus = {
  Draft:      'draft',
  InProgress: 'in_progress',
  Completed:  'completed',
} as const;
export type CampaignStatus = (typeof CampaignStatus)[keyof typeof CampaignStatus];

export const CampaignMode = {
  Sighted: 'sighted',
  Blind:   'blind',
} as const;
export type CampaignMode = (typeof CampaignMode)[keyof typeof CampaignMode];

export const ScanResult = {
  Found:    'found',
  Unknown:  'unknown',
  Recorded: 'recorded',
} as const;
export type ScanResult = (typeof ScanResult)[keyof typeof ScanResult];

export const ReconciliationClassification = {
  Verified:          'verified',
  Misplaced:         'misplaced',
  Missing:           'missing',
  Surplus:           'surplus',
  ConditionVariance: 'condition_variance',
} as const;
export type ReconciliationClassification = (typeof ReconciliationClassification)[keyof typeof ReconciliationClassification];

export const AdjustmentType = {
  UpdateLocation: 'update_location',
  UpdateCondition: 'update_condition',
  WriteOff:        'write_off',
  RegisterNew:     'register_new',
  NoAction:        'no_action',
} as const;
export type AdjustmentType = (typeof AdjustmentType)[keyof typeof AdjustmentType];

