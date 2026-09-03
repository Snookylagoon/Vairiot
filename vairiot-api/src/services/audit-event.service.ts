import type { Prisma } from '@prisma/client';

import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { buildOrderBy } from '../lib/sort';

const AUDIT_SORT_KEYS = ['occurredAt', 'action', 'entityType', 'entityId'] as const;

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

// Audit writes are deliberately fire-and-forget: a request should not wait on
// them, and a failed audit insert must not fail the operation being audited.
// But "nobody is waiting" is not the same as "nobody ever needs to wait" —
// the write is still in flight when the handler responds, which makes it
// racy for anything that tears the data down afterwards, and means a shutdown
// can drop events that were about to land.
//
// Tracking the promises costs nothing and makes them awaitable when it
// matters. See flushAuditEvents() below.
const pending = new Set<Promise<void>>();

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

  const write = prisma.auditEvent
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
    .then(() => undefined)
    // Braces matter: logger.error returns the Logger, so an expression body
    // would make this Promise<Logger | undefined> rather than Promise<void>.
    .catch((e) => {
      logger.error('audit_event_write_failed', { error: e?.message, action: input.action });
    });

  pending.add(write);
  void write.finally(() => pending.delete(write));
}

/**
 * Resolve once every audit write currently in flight has settled.
 *
 * Loops because awaiting can itself let queued writes start — a single
 * Promise.allSettled would miss anything added while it was waiting.
 *
 * Used by the integration tests: their afterAll hooks delete the tenant they
 * created, and an audit event landing between the cleanup and the tenant
 * delete violates audit_events_tenantId_fkey. That produced intermittent
 * "Test suite failed to run" failures on unrelated pull requests (#6 in July,
 * #7 in September). Also worth calling on graceful shutdown.
 */
export async function flushAuditEvents(): Promise<void> {
  while (pending.size) {
    await Promise.allSettled([...pending]);
  }
}

interface ListOpts {
  entityType?: string;
  limit?: number;
  from?: string;
  to?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
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
    orderBy: buildOrderBy(opts.sortBy, opts.sortOrder, AUDIT_SORT_KEYS, { occurredAt: 'desc' as const }),
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
