export const ExceptionType = {
  MissingDocuments:    'missing_documents',
  OverdueMaintenance:  'overdue_maintenance',
  ExpiredWarranty:     'expired_warranty',
  UnlocatedAssets:     'unlocated_assets',
} as const;
export type ExceptionType = (typeof ExceptionType)[keyof typeof ExceptionType];

export const EXCEPTION_TYPES = Object.values(ExceptionType);

export const AlertChannel = {
  Email: 'email',
} as const;
export type AlertChannel = (typeof AlertChannel)[keyof typeof AlertChannel];

export const ALERT_CHANNELS = Object.values(AlertChannel);

export const AlertFrequency = {
  Daily:  'daily',
  Weekly: 'weekly',
} as const;
export type AlertFrequency = (typeof AlertFrequency)[keyof typeof AlertFrequency];

export const ALERT_FREQUENCIES = Object.values(AlertFrequency);
