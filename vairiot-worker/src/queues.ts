// Shared queue names and payload shapes for BullMQ.
// Both API (producer) and worker (consumer) import these.

export const QUEUE_NAMES = {
  auditComplete: 'audit-complete',
  alertDigest: 'alert-digest',
  userInvite: 'user-invite',
  notificationScheduler: 'notification-scheduler',
  webhookDeliver: 'webhook-deliver',
  storageMetering: 'storage-metering',
} as const;

export interface WebhookDeliverJob {
  /** WebhookDelivery row id — hook config and payload are loaded from it. */
  deliveryId: string;
}

// Repeatable tick that fans out alert-digest jobs. Registered by the worker on
// startup; `frequency` selects which subscriptions the tick covers.
export interface SchedulerTickJob {
  frequency: 'daily' | 'weekly';
}

export interface UpcomingMaintenanceItem {
  assetNumber:   string;
  assetName:     string;
  maintenanceType: string;
  scheduledDate: string;          // ISO date
  overdue:       boolean;
}

export interface AlertDigestJob {
  tenantId:       string;
  userId:         string;
  recipientEmail: string;
  recipientName?: string;
  frequency:      'daily' | 'weekly';
  exceptionTypes: string[];
  /** Current count per subscribed exception type (computed at enqueue time). */
  counts?:        Record<string, number>;
  /** Maintenance due in the next 7 days (or overdue) — only present when the
   *  user subscribes to overdue_maintenance. */
  upcomingMaintenance?: UpcomingMaintenanceItem[];
}

export interface UserInviteJob {
  tenantId:       string;
  recipientEmail: string;
  recipientName:  string;
  inviteToken:    string;
  inviterName?:   string;
}

export interface AuditCompleteJob {
  tenantId:      string;
  campaignId:    string;
  campaignName:  string;
  recipientEmail: string;
  recipientName?: string;
  summary: {
    totalExpected: number;
    totalScanned:  number;
    found:         number;
    missingCount:  number;
    unknownCount:  number;
  };
  csv: string;     // full report CSV body
  completedAt: string;
}
