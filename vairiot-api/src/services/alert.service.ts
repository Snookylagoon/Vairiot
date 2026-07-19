import { EXCEPTION_TYPES, ALERT_CHANNELS, ALERT_FREQUENCIES } from 'vairiot-shared';

import { NotFoundError, ValidationError } from '../lib/errors';
import { prisma } from '../lib/prisma';

export interface AlertSubInput {
  exceptionType: string;
  channel?: string;
  frequency?: string;
}

export async function listSubscriptions(tenantId: string, userId: string) {
  return prisma.alertSubscription.findMany({
    where: { tenantId, userId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function upsertSubscription(tenantId: string, userId: string, input: AlertSubInput) {
  if (!EXCEPTION_TYPES.includes(input.exceptionType as any)) throw new ValidationError('Invalid exception type');
  const channel = input.channel ?? 'email';
  const frequency = input.frequency ?? 'daily';
  if (!ALERT_CHANNELS.includes(channel as any)) throw new ValidationError('Invalid channel');
  if (!ALERT_FREQUENCIES.includes(frequency as any)) throw new ValidationError('Invalid frequency');

  return prisma.alertSubscription.upsert({
    where: { tenantId_userId_exceptionType: { tenantId, userId, exceptionType: input.exceptionType } },
    create: { tenantId, userId, exceptionType: input.exceptionType, channel, frequency },
    update: { channel, frequency, active: true },
  });
}

export async function deleteSubscription(tenantId: string, userId: string, exceptionType: string) {
  const sub = await prisma.alertSubscription.findFirst({
    where: { tenantId, userId, exceptionType },
  });
  if (!sub) throw new NotFoundError('Subscription not found');
  await prisma.alertSubscription.delete({ where: { id: sub.id } });
  return { id: sub.id };
}

export async function toggleSubscription(tenantId: string, userId: string, exceptionType: string, active: boolean) {
  const sub = await prisma.alertSubscription.findFirst({
    where: { tenantId, userId, exceptionType },
  });
  if (!sub) throw new NotFoundError('Subscription not found');
  return prisma.alertSubscription.update({
    where: { id: sub.id },
    data: { active },
  });
}

export async function getActiveDigestSubscriptions(frequency: 'daily' | 'weekly') {
  return prisma.alertSubscription.findMany({
    where: { active: true, frequency },
  });
}
