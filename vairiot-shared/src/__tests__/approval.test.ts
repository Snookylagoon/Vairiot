import { approvalDecisionSchema, approvalRulesSchema } from '../schemas/approval.schemas.js';

// Stage 3.2: the approval contracts.

describe('approval contracts', () => {
  it('approves without a reason, rejects only with one', () => {
    expect(approvalDecisionSchema.safeParse({ decision: 'APPROVE' }).success).toBe(true);
    expect(approvalDecisionSchema.safeParse({ decision: 'REJECT' }).success).toBe(false);
    expect(approvalDecisionSchema.safeParse({ decision: 'REJECT', reason: '  ' }).success).toBe(false);
    expect(approvalDecisionSchema.parse({ decision: 'REJECT', reason: ' Wrong site ' }).reason).toBe('Wrong site');
    expect(approvalDecisionSchema.safeParse({ decision: 'MAYBE' }).success).toBe(false);
  });

  it('takes rules in tiers, never two from the same amount, never self-approved disposals', () => {
    const rule = (over: Record<string, unknown>) => ({ action: 'WRITE_OFF', minAmount: 0, approverRoleId: 'r1', ...over });
    expect(approvalRulesSchema.parse({ rules: [rule({}), rule({ minAmount: '5000', approverRoleId: 'r2' })] }).rules[1]).toMatchObject({ minAmount: 5000, requireDifferentUser: true, active: true });
    expect(approvalRulesSchema.safeParse({ rules: [rule({}), rule({})] }).success).toBe(false);
    expect(approvalRulesSchema.safeParse({ rules: [rule({ action: 'DISPOSE', requireDifferentUser: false })] }).success).toBe(false);
    expect(approvalRulesSchema.safeParse({ rules: [rule({ action: 'TRANSFER', requireDifferentUser: false })] }).success).toBe(true);
    expect(approvalRulesSchema.safeParse({ rules: [rule({ action: 'LEND' })] }).success).toBe(false);
  });
});
