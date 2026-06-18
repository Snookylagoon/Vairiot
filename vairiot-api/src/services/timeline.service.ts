import { prisma } from '../lib/prisma';

export interface TimelineEntry {
  id: string;
  type: 'created' | 'updated' | 'transfer' | 'maintenance' | 'checkout' | 'checkin' | 'document' | 'photo' | 'disposal' | 'archived';
  date: Date;
  summary: string;
  actor?: string | null;
  metadata?: Record<string, unknown>;
}

export async function getAssetTimeline(tenantId: string, assetId: string): Promise<TimelineEntry[]> {
  const [auditEvents, transfers, maintenance, checkouts, documents, photos] = await Promise.all([
    prisma.auditEvent.findMany({
      where: { tenantId, entityType: 'asset', entityId: assetId },
      select: { id: true, action: true, occurredAt: true, actorId: true, actor: { select: { name: true } }, metadata: true },
      orderBy: { occurredAt: 'desc' },
    }),
    prisma.transfer.findMany({
      where: { tenantId, assetId },
      select: { id: true, transferDate: true, fromSiteId: true, toSiteId: true, fromCustodian: true, toCustodian: true, reason: true, createdBy: true },
      orderBy: { transferDate: 'desc' },
    }),
    prisma.maintenanceEvent.findMany({
      where: { tenantId, assetId },
      select: { id: true, maintenanceType: true, status: true, scheduledDate: true, completedDate: true, vendor: true, createdBy: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.checkout.findMany({
      where: { tenantId, assetId },
      select: { id: true, custodianId: true, checkedOutAt: true, checkedInAt: true, checkedOutBy: true, checkedInBy: true },
      orderBy: { checkedOutAt: 'desc' },
    }),
    prisma.document.findMany({
      where: { tenantId, assetId },
      select: { id: true, documentType: true, fileName: true, createdAt: true, createdBy: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.photo.findMany({
      where: { tenantId, assetId },
      select: { id: true, caption: true, createdAt: true, createdBy: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const entries: TimelineEntry[] = [];

  for (const ev of auditEvents) {
    entries.push({
      id: ev.id,
      type: ev.action as TimelineEntry['type'],
      date: ev.occurredAt,
      summary: `Asset ${ev.action}`,
      actor: ev.actor?.name ?? ev.actorId,
    });
  }

  for (const t of transfers) {
    entries.push({
      id: t.id,
      type: 'transfer',
      date: t.transferDate,
      summary: t.reason ?? 'Asset transferred',
      actor: t.createdBy,
      metadata: { fromSiteId: t.fromSiteId, toSiteId: t.toSiteId, fromCustodian: t.fromCustodian, toCustodian: t.toCustodian },
    });
  }

  for (const m of maintenance) {
    entries.push({
      id: m.id,
      type: 'maintenance',
      date: m.completedDate ?? m.scheduledDate ?? new Date(),
      summary: `${m.maintenanceType} — ${m.status}${m.vendor ? ` (${m.vendor})` : ''}`,
      actor: m.createdBy,
    });
  }

  for (const c of checkouts) {
    entries.push({
      id: `${c.id}-out`,
      type: 'checkout',
      date: c.checkedOutAt,
      summary: `Checked out to ${c.custodianId}`,
      actor: c.checkedOutBy,
    });
    if (c.checkedInAt) {
      entries.push({
        id: `${c.id}-in`,
        type: 'checkin',
        date: c.checkedInAt,
        summary: `Checked in`,
        actor: c.checkedInBy,
      });
    }
  }

  for (const d of documents) {
    entries.push({
      id: d.id,
      type: 'document',
      date: d.createdAt,
      summary: `Document uploaded: ${d.fileName} (${d.documentType})`,
      actor: d.createdBy,
    });
  }

  for (const p of photos) {
    entries.push({
      id: p.id,
      type: 'photo',
      date: p.createdAt,
      summary: p.caption ?? 'Photo uploaded',
      actor: p.createdBy,
    });
  }

  entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return entries;
}
