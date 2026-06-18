import { prisma } from '../lib/prisma';

export interface AlertSubInput {
  exceptionType: string;
  channel?: string;
  frequency?: string;
}

const VALID_TYPES = ['missing_documents', 'overdue_maintenance', 'expired_warranty', 'unlocated_assets'];
const VALID_CHANNELS = ['email'];
const VALID_FREQUENCIES = ['daily', 'weekly'];

export async function listSubscriptions(tenantId: string, userId: string) {
  return prisma.alertSubscription.findMany({
    where: { tenantId, userId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function upsertSubscription(tenantId: string, userId: string, input: AlertSubInput) {
  if (!VALID_TYPES.includes(input.exceptionType)) throw new Error('INVALID_TYPE');
  const channel = input.channel ?? 'email';
  const frequency = input.frequency ?? 'daily';
  if (!VALID_CHANNELS.includes(channel)) throw new Error('INVALID_CHANNEL');
  if (!VALID_FREQUENCIES.includes(frequency)) throw new Error('INVALID_FREQUENCY');

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
  if (!sub) throw new Error('NOT_FOUND');
  await prisma.alertSubscription.delete({ where: { id: sub.id } });
  return { id: sub.id };
}

export async function toggleSubscription(tenantId: string, userId: string, exceptionType: string, active: boolean) {
  const sub = await prisma.alertSubscription.findFirst({
    where: { tenantId, userId, exceptionType },
  });
  if (!sub) throw new Error('NOT_FOUND');
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
