/**
 * Shared helpers for the licence services: tenant-family resolution, status
 * computation, date arithmetic and the licence audit trail.
 */
import { prisma } from '../lib/prisma';

import { recordAuditEvent } from './audit-event.service';

// ─── Status ──────────────────────────────────────────────────────────────────

type LicenceStatusEnum = 'active' | 'expiring' | 'expired' | 'suspended' | 'revoked';

export function computeStatus(licence: {
  status: string;
  expiresAt: Date | null;
  gracePeriodDays: number;
  expiryWarningDays: number;
}): LicenceStatusEnum {
  if (licence.status === 'suspended' || licence.status === 'revoked') {
    return licence.status as LicenceStatusEnum;
  }
  if (!licence.expiresAt) return 'active';

  const now = Date.now();
  const expiresAt = licence.expiresAt.getTime();
  const warningAt = expiresAt - licence.expiryWarningDays * 24 * 60 * 60 * 1000;
  const graceEnd = expiresAt + licence.gracePeriodDays * 24 * 60 * 60 * 1000;

  if (now > graceEnd) return 'expired';
  if (now > expiresAt) return 'expired';
  if (now > warningAt) return 'expiring';
  return 'active';
}

// ─── Tenant family ───────────────────────────────────────────────────────────

export async function getTenantFamily(parentTenantId: string): Promise<string[]> {
  const children = await prisma.tenant.findMany({
    where: { parentTenantId },
    select: { id: true },
  });
  return [parentTenantId, ...children.map(c => c.id)];
}

export async function getRootTenantId(tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { parentTenantId: true },
  });
  return tenant?.parentTenantId ?? tenantId;
}

// ─── Misc ────────────────────────────────────────────────────────────────────

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export async function auditLicenceEvent(
  tenantId: string,
  actorId: string,
  entityId: string,
  action: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  recordAuditEvent({
    tenantId,
    actor: actorId,
    entityType: 'licence',
    entityId,
    action,
    before: before as never,
    after: after as never,
  });
}
