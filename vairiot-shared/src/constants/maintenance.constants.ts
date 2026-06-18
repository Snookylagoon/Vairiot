export const MaintenanceStatus = {
  Scheduled:  'scheduled',
  InProgress: 'in_progress',
  Completed:  'completed',
  Cancelled:  'cancelled',
} as const;
export type MaintenanceStatus = (typeof MaintenanceStatus)[keyof typeof MaintenanceStatus];

export const MaintenanceType = {
  Preventive:  'preventive',
  Corrective:  'corrective',
  Inspection:  'inspection',
  Calibration: 'calibration',
} as const;
export type MaintenanceType = (typeof MaintenanceType)[keyof typeof MaintenanceType];
