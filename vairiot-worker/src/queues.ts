// Queue names and payload shapes live in vairiot-shared (stage 2.1), shared
// with the API that enqueues the jobs.
export { QUEUE_NAMES } from 'vairiot-shared';
export type {
  AlertDigestJob, AuditCompleteJob, DepreciationRunJob, SchedulerTickJob, UpcomingMaintenanceItem, UserInviteJob, WebhookDeliverJob,
} from 'vairiot-shared';
