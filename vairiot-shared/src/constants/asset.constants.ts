export const AssetStatus = {
  Active:      'active',
  Inactive:    'inactive',
  InUse:       'in_use',
  Maintenance: 'maintenance',
  Disposed:    'disposed',
} as const;
export type AssetStatus = (typeof AssetStatus)[keyof typeof AssetStatus];

export const AssetCondition = {
  New:     'new',
  Good:    'good',
  Fair:    'fair',
  Poor:    'poor',
  Damaged: 'damaged',
} as const;
export type AssetCondition = (typeof AssetCondition)[keyof typeof AssetCondition];

export const DepreciationMethod = {
  StraightLine:     'straight_line',
  DecliningBalance: 'declining_balance',
  None:             'none',
} as const;
export type DepreciationMethod = (typeof DepreciationMethod)[keyof typeof DepreciationMethod];

export const DisposalMethod = {
  Sale:      'sale',
  Donation:  'donation',
  Recycled:  'recycled',
  Scrapped:  'scrapped',
  TradeIn:   'trade_in',
  WriteOff:  'write_off',
} as const;
export type DisposalMethod = (typeof DisposalMethod)[keyof typeof DisposalMethod];
