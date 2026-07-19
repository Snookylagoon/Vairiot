import { randomBytes, createHmac } from 'crypto';

import { WEBHOOK_EVENTS } from 'vairiot-shared';

import { NotFoundError, ValidationError } from '../lib/errors';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { enqueueWebhookDeliver } from '../lib/queue';

export interface WebhookInput {
  name: string;
  url: string;
  events: string[];
  secret?: string;
}

export async function listWebhooks(tenantId: string) {
  return prisma.webhook.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createWebhook(tenantId: string, actorId: string, input: WebhookInput) {
  const invalid = input.events.filter(e => !WEBHOOK_EVENTS.includes(e as any));
  if (invalid.length) throw new ValidationError(`Invalid events: ${invalid.join(', ')}`);

  const secret = input.secret ?? randomBytes(32).toString('hex');

  return prisma.webhook.create({
    data: {
      tenantId,
      name: input.name,
      url: input.url,
      events: input.events,
      secret,
      createdBy: actorId,
    },
  });
}

export async function deleteWebhook(tenantId: string, id: string) {
  const wh = await prisma.webhook.findFirst({ where: { id, tenantId } });
  if (!wh) throw new NotFoundError('Webhook not found');
  await prisma.webhook.delete({ where: { id } });
  return { id };
}

export async function toggleWebhook(tenantId: string, id: string, active: boolean) {
  const wh = await prisma.webhook.findFirst({ where: { id, tenantId } });
  if (!wh) throw new NotFoundError('Webhook not found');
  return prisma.webhook.update({ where: { id }, data: { active } });
}

export async function dispatchWebhookEvent(tenantId: string, event: string, payload: unknown) {
  const hooks = await prisma.webhook.findMany({
    where: { tenantId, active: true, events: { has: event } },
  });

  for (const hook of hooks) {
    const envelope = { event, timestamp: new Date().toISOString(), data: payload };

    // Durable dispatch: log the delivery, then let the worker POST it with
    // BullMQ retries/backoff. Falls back to the old fire-and-forget fetch only
    // if the queue is unavailable (e.g. WORKER_DISABLED).
    try {
      const delivery = await prisma.webhookDelivery.create({
        data: {
          tenantId,
          webhookId: hook.id,
          event,
          url: hook.url,
          payload: envelope as object,
        },
      });
      const queued = await enqueueWebhookDeliver({ deliveryId: delivery.id });
      if (queued) continue;
    } catch (err) {
      logger.error('webhook delivery log failed — falling back to direct dispatch', {
        webhookId: hook.id, event, error: (err as Error)?.message,
      });
    }

    const body = JSON.stringify(envelope);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (hook.secret) {
      headers['X-Vairiot-Signature'] = createHmac('sha256', hook.secret).update(body).digest('hex');
    }
    fetch(hook.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10_000) })
      .catch(err => logger.error(`webhook delivery failed`, { webhookId: hook.id, event, error: err?.message }));
  }
}

/** Recent delivery history for a tenant's webhooks (for the integrations UI). */
export async function listDeliveries(tenantId: string, webhookId?: string, limit = 50) {
  return prisma.webhookDelivery.findMany({
    where: { tenantId, ...(webhookId ? { webhookId } : {}) },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 200),
    select: {
      id: true, webhookId: true, event: true, url: true, status: true,
      attempts: true, responseCode: true, lastError: true,
      createdAt: true, deliveredAt: true,
    },
  });
}

export function getValidEvents() {
  return WEBHOOK_EVENTS;
}
