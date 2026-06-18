import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

export interface RecordEventInput {
  tenantId:   string;
  actor:      string;
  entityType: string;
  entityId:   string;
  action:     string;
  before?:    Prisma.InputJsonValue;
  after?:     Prisma.InputJsonValue;
  metadata?:  Prisma.InputJsonValue;
}

export function recordAuditEvent(input: RecordEventInput): void {
  const isApiKey   = input.actor.startsWith('apikey:');
  const actorId    = isApiKey ? null : input.actor;
  const metaSource =
    typeof input.metadata === 'object' && input.metadata !== null && !Array.isArray(input.metadata)
      ? input.metadata as Record<string, unknown>
      : undefined;
  const metaBase: Record<string, unknown> = isApiKey
    ? { ...(metaSource ?? {}), actorKey: input.actor.slice('apikey:'.length) }
    : (metaSource ?? {});

  prisma.auditEvent
    .create({
      data: {
        tenantId:   input.tenantId,
        actorId,
        entityType: input.entityType,
        entityId:   input.entityId,
        action:     input.action,
        before:     input.before,
        after:      input.after,
        metadata:   Object.keys(metaBase).length ? (metaBase as Prisma.InputJsonValue) : undefined,
      },
    })
    .catch((e) => logger.error('audit_event_write_failed', { error: e?.message, action: input.action }));
}

interface ListOpts {
  entityType?: string;
  limit?: number;
  from?: string;
  to?: string;
  search?: string;
}

function buildWhere(tenantId: string, opts: ListOpts): Prisma.AuditEventWhereInput {
  return {
    tenantId,
    ...(opts.entityType ? { entityType: opts.entityType } : {}),
    ...(opts.from || opts.to ? {
      occurredAt: {
        ...(opts.from && { gte: new Date(opts.from) }),
        ...(opts.to && { lte: new Date(opts.to) }),
      },
    } : {}),
    ...(opts.search ? {
      OR: [
        { action: { contains: opts.search, mode: 'insensitive' as const } },
        { entityId: { contains: opts.search, mode: 'insensitive' as const } },
        { entityType: { contains: opts.search, mode: 'insensitive' as const } },
      ],
    } : {}),
  };
}

export async function listAuditEvents(tenantId: string, opts: ListOpts = {}) {
  const limit = Math.min(opts.limit ?? 100, 500);
  return prisma.auditEvent.findMany({
    where: buildWhere(tenantId, opts),
    orderBy: { occurredAt: 'desc' },
    take: limit,
    select: {
      id: true, entityType: true, entityId: true, action: true,
      actorId: true, occurredAt: true,
      before: true, after: true, metadata: true,
      actor: { select: { name: true, email: true } },
    },
  });
}

export async function listAuditEventsForExport(
  tenantId: string,
  opts: { entityType?: string; from?: string; to?: string } = {},
) {
  return prisma.auditEvent.findMany({
    where: buildWhere(tenantId, opts),
    orderBy: { occurredAt: 'desc' },
    take: 10000,
    select: {
      occurredAt: true, actorId: true, entityType: true, entityId: true, action: true,
      actor: { select: { name: true } },
    },
  });
}
