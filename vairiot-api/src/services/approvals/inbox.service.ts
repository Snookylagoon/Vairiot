import type { ApprovalStatus } from '@prisma/client';

import { prisma } from '../../lib/prisma';
import { tenantFeatureEnabled } from '../tenant-features.service';

// What waits for a decision (stage 3.2, D22): approval requests, and the
// ledger's own post steps, which keep their D17 check (a depreciation run
// prepared by someone else, an impairment assessed by someone else) and show
// here so an approver has one list.

export interface Viewer { userId: string; permissions: string[] }

const STATUSES: ApprovalStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'FAILED'];

/** The user's role ids, for "may I decide this". */
async function rolesOf(userId: string) {
  return new Set((await prisma.userRole.findMany({ where: { userId }, select: { roleId: true } })).map((r) => r.roleId));
}

export async function listApprovals(tenantId: string, viewer: Viewer, filters: { status?: string; assetId?: string; mine?: boolean } = {}) {
  const status = STATUSES.includes(filters.status as ApprovalStatus) ? (filters.status as ApprovalStatus) : undefined;
  const requests = await prisma.approvalRequest.findMany({
    where: { tenantId, ...(status && { status }), ...(filters.assetId && { assetId: filters.assetId }), ...(filters.mine && { requestedBy: viewer.userId }) },
    include: { rule: { include: { role: { select: { id: true, name: true } } } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const ids = [...new Set(requests.flatMap((r) => [r.requestedBy, r.decidedBy]).filter((x): x is string => !!x))];
  const names = new Map((await prisma.user.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u.name || u.email]));
  const roles = await rolesOf(viewer.userId);
  const decides = viewer.permissions.includes('approval:decide');
  return requests.map((r) => ({
    ...r,
    requestedByName: names.get(r.requestedBy) ?? null,
    decidedByName: r.decidedBy ? names.get(r.decidedBy) ?? null : null,
    approverRole: r.rule?.role?.name ?? null,
    canDecide: r.status === 'PENDING' && decides && r.requestedBy !== viewer.userId && (!r.rule?.approverRoleId || roles.has(r.rule.approverRoleId)),
  }));
}

/** Everything the user can decide now, and how many: the header badge. */
export async function inbox(tenantId: string, viewer: Viewer) {
  const requests = (await listApprovals(tenantId, viewer, { status: 'PENDING' })).filter((r) => r.canDecide);
  const ledger = viewer.permissions.includes('accounting:approve') && (await tenantFeatureEnabled(tenantId, 'ipsas'));
  const [runs, impairments] = ledger ? await Promise.all([
    prisma.depreciationRun.findMany({
      where: { tenantId, status: 'DRAFT', jobState: 'DONE', reversalOfRunId: null, NOT: { preparedBy: viewer.userId } },
      select: { id: true, assetCount: true, totalCharge: true, period: { select: { id: true, year: true, month: true } }, preparedBy: true, createdAt: true },
    }),
    prisma.impairment.findMany({
      where: { tenantId, status: 'DRAFT', loss: { not: null }, NOT: { assessedBy: viewer.userId } },
      select: { id: true, kind: true, loss: true, asset: { select: { id: true, assetNumber: true, name: true } }, assessedBy: true, assessedAt: true },
    }),
  ]) : [[], []];
  return { requests, runs, impairments, count: requests.length + runs.length + impairments.length };
}
