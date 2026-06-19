// Shared queue names and payload shapes for BullMQ.
// Both API (producer) and worker (consumer) import these.

export const QUEUE_NAMES = {
  auditComplete: 'audit-complete',
  alertDigest: 'alert-digest',
  userInvite: 'user-invite',
} as const;

export interface AlertDigestJob {
  tenantId:       string;
  userId:         string;
  recipientEmail: string;
  recipientName?: string;
  frequency:      'daily' | 'weekly';
  exceptionTypes: string[];
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
