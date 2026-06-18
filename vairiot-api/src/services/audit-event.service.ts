import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

export interface RecordEventInput {
  tenantId:   string;
  actor:      string;   // req.user.sub — either a userId or "apikey:<id>"
  entityType: string;
  entityId:   string;
  action:     string;
  before?:    Prisma.InputJsonValue;
  after?:     Prisma.InputJsonValue;
  metadata?:  Prisma.InputJsonValue;
}

/**
 * Persist an audit event. AuditEvent.actorId is a User FK, so when the action
 * came from an API key we store null on actorId and stash the key id in
 * metadata.actorKey instead.
 */
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

export async function listAuditEvents(
  tenantId: string,
  opts: { entityType?: string; limit?: number } = {},
) {
  const limit = Math.min(opts.limit ?? 100, 500);
  return prisma.auditEvent.findMany({
    where: { tenantId, ...(opts.entityType ? { entityType: opts.entityType } : {}) },
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
