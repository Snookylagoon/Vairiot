import { prisma } from '../lib/prisma';
import { randomBytes, createHmac } from 'crypto';
import { logger } from '../lib/logger';

export interface WebhookInput {
  name: string;
  url: string;
  events: string[];
  secret?: string;
}

const VALID_EVENTS = [
  'asset.created', 'asset.updated', 'asset.disposed', 'asset.archived',
  'maintenance.created', 'maintenance.completed',
  'transfer.created', 'checkout.created', 'checkout.returned',
];

export async function listWebhooks(tenantId: string) {
  return prisma.webhook.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createWebhook(tenantId: string, actorId: string, input: WebhookInput) {
  const invalid = input.events.filter(e => !VALID_EVENTS.includes(e));
  if (invalid.length) throw new Error(`INVALID_EVENTS: ${invalid.join(', ')}`);

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
  if (!wh) throw new Error('NOT_FOUND');
  await prisma.webhook.delete({ where: { id } });
  return { id };
}

export async function toggleWebhook(tenantId: string, id: string, active: boolean) {
  const wh = await prisma.webhook.findFirst({ where: { id, tenantId } });
  if (!wh) throw new Error('NOT_FOUND');
  return prisma.webhook.update({ where: { id }, data: { active } });
}

export async function dispatchWebhookEvent(tenantId: string, event: string, payload: unknown) {
  const hooks = await prisma.webhook.findMany({
    where: { tenantId, active: true, events: { has: event } },
  });

  for (const hook of hooks) {
    const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (hook.secret) {
      headers['X-Vairiot-Signature'] = createHmac('sha256', hook.secret).update(body).digest('hex');
    }

    fetch(hook.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10_000) })
      .catch(err => logger.error(`webhook delivery failed`, { webhookId: hook.id, event, error: err?.message }));
  }
}

export function getValidEvents() {
  return VALID_EVENTS;
}
