import { Prisma, type ApprovalAction, type ApprovalRequest } from '@prisma/client';
import { NEVER_SELF_APPROVED, type ApprovalDecision, type ApprovalRulesInput } from 'vairiot-shared';

import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { money, type MoneyInput } from '../../lib/money';
import { prisma } from '../../lib/prisma';
import { enqueueApprovalNotify } from '../../lib/queue';
import { recordAuditEvent } from '../audit-event.service';

// Maker-checker approvals (Phase 3, S3.1, stage 3.2, D22). An action that a
// tenant's rule covers is not done when asked: a request records what was
// asked (the payload), and the action's own service applies it when someone
// else approves. Until then nothing changes, so a rejection needs no undo.
//
// Rules come in tiers per action: the one with the highest minimum not above
// the amount applies; below every tier, or with no rule, the action proceeds
// at once as before (and is logged by its service). Disposal and write-off
// are never approved by their requester.

export interface ApprovalSpec {
  action: ApprovalAction;
  assetId: string | null;
  entityType: string;
  entityId: string;
  payload: Prisma.InputJsonValue;
  /** What the threshold is tested on; none counts as zero. */
  amount: MoneyInput;
  summary: string;
}

export type Applier = (request: ApprovalRequest, deciderId: string) => Promise<Prisma.InputJsonValue>;
const appliers = new Map<ApprovalAction, Applier>();
/** Each action registers how an approved request is applied (approval-wiring.ts). */
export function registerApplier(action: ApprovalAction, apply: Applier) { appliers.set(action, apply); }

/** The rule that applies to an action at an amount, or none. */
export async function ruleFor(tenantId: string, action: ApprovalAction, amount: MoneyInput) {
  const rules = await prisma.approvalRule.findMany({ where: { tenantId, action, active: true }, orderBy: { minAmount: 'desc' } });
  const value = money(amount ?? 0);
  return rules.find((r) => value.greaterThanOrEqualTo(r.minAmount)) ?? null;
}

/**
 * Runs the action at once when no rule covers it; otherwise records a
 * request and returns it. One open request per action and thing.
 */
export async function throughApproval<T>(tenantId: string, actorId: string, spec: ApprovalSpec, proceed: () => Promise<T>):
  Promise<{ approval: ApprovalRequest; result?: undefined } | { result: T; approval?: undefined }> {
  const rule = await ruleFor(tenantId, spec.action, spec.amount);
  if (!rule) return { result: await proceed() };
  let approval: ApprovalRequest;
  try {
    approval = await prisma.approvalRequest.create({
      data: {
        tenantId, action: spec.action, assetId: spec.assetId, entityType: spec.entityType, entityId: spec.entityId, payload: spec.payload,
        amount: spec.amount === null || spec.amount === undefined ? null : money(spec.amount), summary: spec.summary, ruleId: rule.id, requestedBy: actorId,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError('A request for this is already waiting for approval', 'APPROVAL_PENDING');
    }
    throw err;
  }
  recordAuditEvent({ tenantId, actor: actorId, entityType: 'approval_request', entityId: approval.id, action: 'requested', after: { action: spec.action, entityId: spec.entityId, summary: spec.summary } });
  void enqueueApprovalNotify({ tenantId, approvalId: approval.id, event: 'requested' });
  return { approval };
}

async function findRequest(tenantId: string, id: string) {
  const r = await prisma.approvalRequest.findFirst({ where: { id, tenantId }, include: { rule: true } });
  if (!r) throw new NotFoundError('Approval request not found');
  return r;
}

/** Whether a user may decide a request: approval:decide, the rule's role if it names one, and not their own where that is barred. */
async function assertMayDecide(request: Awaited<ReturnType<typeof findRequest>>, userId: string, permissions: string[]) {
  if (!permissions.includes('approval:decide')) throw new ForbiddenError('Deciding approvals needs approval:decide');
  const selfBarred = NEVER_SELF_APPROVED.includes(request.action) || (request.rule?.requireDifferentUser ?? true);
  if (selfBarred && request.requestedBy === userId) throw new ForbiddenError('You asked for this change: someone else must approve it');
  if (request.rule?.approverRoleId) {
    const member = await prisma.userRole.count({ where: { userId, roleId: request.rule.approverRoleId } });
    if (!member) throw new ForbiddenError('This approval is for another role');
  }
}

/** Approves (applying the change through its service) or rejects a pending request. */
export async function decide(tenantId: string, userId: string, permissions: string[], id: string, decision: ApprovalDecision) {
  const request = await findRequest(tenantId, id);
  if (request.status !== 'PENDING') throw new ConflictError('The request has already been decided', 'NOT_PENDING');
  await assertMayDecide(request, userId, permissions);
  const decided = { decidedBy: userId, decidedAt: new Date(), reason: decision.reason ?? null };
  // Claim the request first, so two approvers at once cannot both apply it.
  const claimed = await prisma.approvalRequest.updateMany({ where: { id, status: 'PENDING' }, data: { status: decision.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', ...decided } });
  if (claimed.count === 0) throw new ConflictError('The request has already been decided', 'NOT_PENDING');
  let updated: ApprovalRequest;
  if (decision.decision === 'REJECT') {
    updated = await prisma.approvalRequest.findUniqueOrThrow({ where: { id } });
  } else {
    const apply = appliers.get(request.action);
    try {
      if (!apply) throw new Error(`No applier for ${request.action}`);
      const result = await apply(request, userId);
      updated = await prisma.approvalRequest.update({ where: { id }, data: { result } });
    } catch (err) {
      logger.warn('approved change could not be applied', { id, action: request.action, err: String(err) });
      updated = await prisma.approvalRequest.update({ where: { id }, data: { status: 'FAILED', error: (err as Error).message.slice(0, 500) } });
    }
  }
  recordAuditEvent({ tenantId, actor: userId, entityType: 'approval_request', entityId: id, action: updated.status.toLowerCase(), after: { action: request.action, entityId: request.entityId, reason: decision.reason ?? null, error: updated.error } });
  void enqueueApprovalNotify({ tenantId, approvalId: id, event: 'decided' });
  return updated;
}

/** The requester withdraws a pending request. */
export async function cancel(tenantId: string, userId: string, id: string) {
  const request = await findRequest(tenantId, id);
  if (request.status !== 'PENDING') throw new ConflictError('The request has already been decided', 'NOT_PENDING');
  if (request.requestedBy !== userId) throw new ForbiddenError('Only the person who asked can withdraw it');
  const updated = await prisma.approvalRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
  recordAuditEvent({ tenantId, actor: userId, entityType: 'approval_request', entityId: id, action: 'cancelled' });
  return updated;
}

// ── Rules ────────────────────────────────────────────────────────────────────

export async function listRules(tenantId: string) {
  return prisma.approvalRule.findMany({ where: { tenantId }, include: { role: { select: { id: true, name: true } } }, orderBy: [{ action: 'asc' }, { minAmount: 'asc' }] });
}

/** Replaces the tenant's rules; open requests keep the rule they were made under. */
export async function setRules(tenantId: string, actorId: string, input: ApprovalRulesInput) {
  const roles = [...new Set(input.rules.map((r) => r.approverRoleId).filter((x): x is string => !!x))];
  if (roles.length && (await prisma.role.count({ where: { tenantId, id: { in: roles } } })) !== roles.length) throw new NotFoundError('Role not found');
  const before = await listRules(tenantId);
  await prisma.$transaction(async (tx) => {
    const keep = input.rules.map((r) => ({ action: r.action, minAmount: money(r.minAmount) }));
    for (const old of before) {
      if (!keep.some((k) => k.action === old.action && k.minAmount.equals(old.minAmount))) {
        await tx.approvalRule.update({ where: { id: old.id }, data: { active: false } });
      }
    }
    for (const r of input.rules) {
      await tx.approvalRule.upsert({
        where: { tenantId_action_minAmount: { tenantId, action: r.action, minAmount: r.minAmount } },
        update: { approverRoleId: r.approverRoleId, requireDifferentUser: r.requireDifferentUser, active: r.active },
        create: { tenantId, action: r.action, minAmount: r.minAmount, approverRoleId: r.approverRoleId, requireDifferentUser: r.requireDifferentUser, active: r.active },
      });
    }
  });
  recordAuditEvent({ tenantId, actor: actorId, entityType: 'approval_rules', entityId: tenantId, action: 'updated', before: before.map((r) => ({ action: r.action, minAmount: r.minAmount.toFixed(2), role: r.role?.name ?? null, active: r.active })), after: input.rules });
  return listRules(tenantId);
}
