export const WebhookEvent = {
  AssetCreated:          'asset.created',
  AssetUpdated:          'asset.updated',
  AssetDisposed:         'asset.disposed',
  AssetArchived:         'asset.archived',
  MaintenanceCreated:    'maintenance.created',
  MaintenanceCompleted:  'maintenance.completed',
  TransferCreated:       'transfer.created',
  CheckoutCreated:       'checkout.created',
  CheckoutReturned:      'checkout.returned',
} as const;
export type WebhookEvent = (typeof WebhookEvent)[keyof typeof WebhookEvent];

export const WEBHOOK_EVENTS = Object.values(WebhookEvent);
