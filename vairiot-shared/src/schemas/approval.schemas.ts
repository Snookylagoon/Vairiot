import { z } from 'zod';

// Maker-checker approvals (Phase 3, S3.1, stage 3.2, D22): the contracts the
// API and the web share (D19).

export const APPROVAL_ACTIONS = ['CAPITALISE', 'TRANSFER', 'DISPOSE', 'WRITE_OFF', 'REGISTER_NEW'] as const;
export type ApprovalActionKey = (typeof APPROVAL_ACTIONS)[number];
/** Never approved by the person who asked, whatever the rule says. */
export const NEVER_SELF_APPROVED: readonly ApprovalActionKey[] = ['DISPOSE', 'WRITE_OFF'];
export const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'FAILED'] as const;

/** Approve, or reject with a reason. */
export const approvalDecisionSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('APPROVE'), reason: z.string().trim().max(1000).optional() }),
  z.object({ decision: z.literal('REJECT'), reason: z.string().trim().min(1, 'Give a reason for the rejection').max(1000) }),
]);
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;

/** A tenant's rules, replaced as a whole. */
export const approvalRulesSchema = z.object({
  rules: z.array(z.object({
    action: z.enum(APPROVAL_ACTIONS),
    minAmount: z.coerce.number().finite().min(0).max(1e12),
    approverRoleId: z.string().min(1).nullable(),
    requireDifferentUser: z.boolean().default(true),
    active: z.boolean().default(true),
  })).max(50),
}).superRefine((v, ctx) => {
  const seen = new Set<string>();
  v.rules.forEach((r, i) => {
    const key = `${r.action}|${r.minAmount}`;
    if (seen.has(key)) ctx.addIssue({ code: 'custom', path: ['rules', i], message: `Two ${r.action} rules from ${r.minAmount}` });
    seen.add(key);
    if (NEVER_SELF_APPROVED.includes(r.action) && !r.requireDifferentUser) {
      ctx.addIssue({ code: 'custom', path: ['rules', i, 'requireDifferentUser'], message: `${r.action} is always approved by someone else` });
    }
  });
});
export type ApprovalRulesInput = z.infer<typeof approvalRulesSchema>;
