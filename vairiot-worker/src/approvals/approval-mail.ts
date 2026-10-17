import type { PrismaClient } from '@prisma/client';
import type { ApprovalNotifyJob } from 'vairiot-shared';

// The approval emails (Phase 3, S3.1, stage 3.2): to the people who can
// decide a new request (approval:decide, in the rule's role when it names
// one, never the requester), and to the requester once it is decided.

export interface ApprovalMail { to: string[]; subject: string; text: string }

const ACTION: Record<string, string> = {
  CAPITALISE: 'Capitalisation', TRANSFER: 'Transfer', DISPOSE: 'Disposal', WRITE_OFF: 'Write-off', REGISTER_NEW: 'New asset from a count',
};

export async function buildApprovalMail(db: PrismaClient, job: ApprovalNotifyJob, appUrl: string): Promise<ApprovalMail | null> {
  const r = await db.approvalRequest.findFirst({ where: { id: job.approvalId, tenantId: job.tenantId }, include: { rule: true } });
  if (!r) return null;
  const link = `${appUrl.replace(/\/$/, '')}/approvals`;
  const label = ACTION[r.action] ?? r.action;
  const requester = await db.user.findUnique({ where: { id: r.requestedBy }, select: { name: true, email: true, active: true } });

  if (job.event === 'requested') {
    if (r.status !== 'PENDING') return null;
    const users = await db.user.findMany({
      where: {
        tenantId: job.tenantId, active: true, id: { not: r.requestedBy },
        roles: { some: r.rule?.approverRoleId ? { roleId: r.rule.approverRoleId, role: { permissions: { has: 'approval:decide' } } } : { role: { permissions: { has: 'approval:decide' } } } },
      },
      select: { email: true },
    });
    if (users.length === 0) return null;
    return {
      to: users.map((u) => u.email),
      subject: `Approval needed: ${r.summary}`.slice(0, 200),
      text: [
        `${requester?.name || requester?.email || 'Someone'} asked for this change, which needs a second person:`, '',
        `  ${label}: ${r.summary}`, ...(r.amount ? [`  Amount: ${r.amount.toFixed(2)}`] : []), '',
        `Approve or reject it in Vairiot: ${link}`, '', 'Nothing changes until it is approved.', '', '— Vairiot',
      ].join('\n'),
    };
  }

  if (!requester?.active || !['APPROVED', 'REJECTED', 'FAILED'].includes(r.status)) return null;
  const outcome = r.status === 'APPROVED' ? 'was approved and has been made' : r.status === 'REJECTED' ? 'was rejected' : 'was approved, but could not be made';
  return {
    to: [requester.email],
    subject: `${label} ${r.status === 'REJECTED' ? 'rejected' : r.status === 'FAILED' ? 'not made' : 'approved'}: ${r.summary}`.slice(0, 200),
    text: [
      `Your request ${outcome}:`, '', `  ${label}: ${r.summary}`,
      ...(r.reason ? ['', `Reason: ${r.reason}`] : []), ...(r.error ? ['', `Why it was not made: ${r.error}`] : []), '',
      `See it in Vairiot: ${link}`, '', '— Vairiot',
    ].join('\n'),
  };
}
