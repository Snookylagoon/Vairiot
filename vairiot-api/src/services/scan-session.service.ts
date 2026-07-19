import { ConflictError } from '../lib/errors';
import { prisma } from '../lib/prisma';

export interface ScanSessionTagInput {
  epc:         string;
  status:      string;
  readCount:   number;
  firstSeenMs: number;
  lastSeenMs:  number;
  assetId?:    string | null;
}

export interface ScanSessionUploadInput {
  sessionId:     string;
  siteId?:       string | null;
  categoryId?:   string | null;
  createdAtMs:   number;
  completedAtMs: number;
  tags:          ScanSessionTagInput[];
}

/**
 * Best-effort upload of a completed mobile RFID scan session. Idempotent on
 * sessionId (the mobile-generated UUID) so a network-retry re-POST upserts
 * rather than erroring or duplicating rows — mirrors the audit-completion
 * idempotency fix, since the mobile client already treats this as best-effort
 * and may resend after a timeout.
 */
export async function uploadScanSession(tenantId: string, actorId: string, input: ScanSessionUploadInput) {
  const existing = await prisma.scanSession.findUnique({ where: { id: input.sessionId } });
  if (existing && existing.tenantId !== tenantId) {
    throw new ConflictError('Session ID already used by another tenant', 'SESSION_ID_CONFLICT');
  }

  const session = await prisma.scanSession.upsert({
    where: { id: input.sessionId },
    update: {
      siteId:      input.siteId ?? null,
      categoryId:  input.categoryId ?? null,
      startedAt:   new Date(input.createdAtMs),
      completedAt: new Date(input.completedAtMs),
    },
    create: {
      id:          input.sessionId,
      tenantId,
      siteId:      input.siteId ?? null,
      categoryId:  input.categoryId ?? null,
      createdBy:   actorId,
      startedAt:   new Date(input.createdAtMs),
      completedAt: new Date(input.completedAtMs),
    },
  });

  // Tags are uploaded once as a full snapshot at completion (not incrementally),
  // so replacing on re-upload is simplest and keeps this idempotent.
  await prisma.scanSessionTag.deleteMany({ where: { sessionId: session.id } });
  if (input.tags.length > 0) {
    await prisma.scanSessionTag.createMany({
      data: input.tags.map(tag => ({
        sessionId:   session.id,
        epc:         tag.epc,
        status:      tag.status,
        readCount:   tag.readCount,
        firstSeenAt: new Date(tag.firstSeenMs),
        lastSeenAt:  new Date(tag.lastSeenMs),
        assetId:     tag.assetId ?? null,
      })),
    });
  }

  return { id: session.id, uploadedAt: session.uploadedAt.toISOString() };
}
