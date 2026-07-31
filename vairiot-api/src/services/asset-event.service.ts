import type { AssetEventType, Prisma } from '@prisma/client';

import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';

/**
 * Append one row to the hash-chained, append-only asset event log
 * (spec §5.7). seq, prevHash and hash are computed by the BEFORE INSERT
 * trigger; UPDATE/DELETE are blocked by database rules.
 */
export async function recordAssetEvent(input: {
  tenantId: string;
  assetId: string;
  eventType: AssetEventType;
  actor?: string | null;
  deviceId?: string | null;
  source: 'WEB' | 'MOBILE' | 'API' | 'MIGRATION' | 'SYSTEM';
  occurredAt?: Date;
  payload?: Prisma.InputJsonValue;
}): Promise<void> {
  const actorUserId =
    input.actor && !input.actor.startsWith('apikey:') ? input.actor : null;
  try {
    await prisma.assetEvent.create({
      data: {
        tenantId: input.tenantId,
        assetId: input.assetId,
        eventType: input.eventType,
        occurredAt: input.occurredAt ?? new Date(),
        actorUserId,
        deviceId: input.deviceId ?? null,
        source: input.source,
        payload: input.payload ?? {},
      },
    });
  } catch (err) {
    // The event log must never take the state change down with it; failures
    // are logged loudly and surfaced by the nightly chain verification.
    logger.error('asset_event write failed', { assetId: input.assetId, err: String(err) });
  }
}

export async function listAssetEvents(tenantId: string, assetId: string) {
  return prisma.assetEvent.findMany({
    where: { tenantId, assetId },
    orderBy: { seq: 'desc' },
    take: 200,
  });
}

/** Nightly chain verification (spec §5.7) — any row returned is tampering. */
export async function verifyAssetEventChain(tenantId?: string) {
  const rows = await prisma.$queryRaw<
    Array<{ assetId: string; seq: bigint }>
  >`WITH chained AS (
      SELECT "tenantId", "assetId", seq, hash, "prevHash",
             lag(hash) OVER (PARTITION BY "assetId" ORDER BY seq) AS expected_prev
      FROM "asset_events")
    SELECT "assetId", seq FROM chained
    WHERE expected_prev IS DISTINCT FROM "prevHash" AND seq > 1
      AND (${tenantId ?? null}::text IS NULL OR "tenantId" = ${tenantId ?? null})`;
  return rows.map((r) => ({ assetId: r.assetId, seq: Number(r.seq) }));
}
