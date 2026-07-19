import { createHmac } from 'crypto';

import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { logger } from '../logger';
import { WebhookDeliverJob } from '../queues';

const prisma = new PrismaClient();

/**
 * POSTs one logged webhook delivery. Throwing lets BullMQ retry with backoff;
 * the delivery row tracks every attempt so tenants can see what happened.
 */
export async function handleWebhookDeliver(job: Job<WebhookDeliverJob>): Promise<void> {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: job.data.deliveryId },
    include: { webhook: { select: { secret: true, active: true } } },
  });
  if (!delivery) {
    logger.warn(`webhook-deliver ${job.id}: delivery row ${job.data.deliveryId} missing — skipping`);
    return;
  }
  if (delivery.status === 'delivered') return; // replayed job — already done
  if (!delivery.webhook.active) {
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: 'failed', lastError: 'Webhook disabled before delivery' },
    });
    return;
  }

  const body = JSON.stringify(delivery.payload);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (delivery.webhook.secret) {
    headers['X-Vairiot-Signature'] =
      createHmac('sha256', delivery.webhook.secret).update(body).digest('hex');
  }

  const maxAttempts = job.opts?.attempts ?? 1;
  const isFinalAttempt = job.attemptsMade + 1 >= maxAttempts;

  try {
    const res = await fetch(delivery.url, {
      method: 'POST', headers, body, signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'delivered',
          attempts: { increment: 1 },
          responseCode: res.status,
          lastError: null,
          deliveredAt: new Date(),
        },
      });
      return;
    }
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: isFinalAttempt ? 'failed' : 'pending',
        attempts: { increment: 1 },
        responseCode: res.status,
        lastError: `HTTP ${res.status}`,
      },
    });
    throw new Error(`Webhook endpoint returned HTTP ${res.status}`);
  } catch (err) {
    if ((err as Error).message?.startsWith('Webhook endpoint returned')) throw err;
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: isFinalAttempt ? 'failed' : 'pending',
        attempts: { increment: 1 },
        lastError: (err as Error).message ?? 'network error',
      },
    });
    throw err;
  }
}
