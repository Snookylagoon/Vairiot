import type { PrismaClient } from '@prisma/client';

import { buildApprovalMail } from '../approvals/approval-mail';

// Stage 3.2: who hears about an approval, and what they are told.

const request = (over: Record<string, unknown> = {}) => ({
  id: 'ap1', tenantId: 't', action: 'DISPOSE', status: 'PENDING', summary: 'Dispose of AST-000001 Stop sign (scrap)', amount: { toFixed: () => '976.20' },
  requestedBy: 'op', reason: null, error: null, rule: { approverRoleId: 'finance-role' }, ...over,
});

function fake(r: Record<string, unknown> | null, approvers: Array<{ email: string }> = [{ email: 'fin@t.test' }]) {
  const findMany = jest.fn().mockResolvedValue(approvers);
  const db = {
    approvalRequest: { findFirst: jest.fn().mockResolvedValue(r) },
    user: { findUnique: jest.fn().mockResolvedValue({ name: 'Nino', email: 'op@t.test', active: true }), findMany },
  };
  return { db: db as unknown as PrismaClient, findMany };
}

it('tells the approvers in the rule’s role of a new request, never the requester', async () => {
  const { db, findMany } = fake(request());
  const mail = await buildApprovalMail(db, { tenantId: 't', approvalId: 'ap1', event: 'requested' }, 'https://test.vairiot.com/');
  expect(mail).toMatchObject({ to: ['fin@t.test'], subject: 'Approval needed: Dispose of AST-000001 Stop sign (scrap)' });
  expect(mail!.text).toContain('Nino asked for this change');
  expect(mail!.text).toContain('Amount: 976.20');
  expect(mail!.text).toContain('https://test.vairiot.com/approvals');
  const where = findMany.mock.calls[0][0].where;
  expect(where).toMatchObject({ tenantId: 't', active: true, id: { not: 'op' }, roles: { some: { roleId: 'finance-role', role: { permissions: { has: 'approval:decide' } } } } });
});

it('without a role on the rule, asks anyone who may decide', async () => {
  const { db, findMany } = fake(request({ rule: { approverRoleId: null } }));
  await buildApprovalMail(db, { tenantId: 't', approvalId: 'ap1', event: 'requested' }, 'x');
  expect(findMany.mock.calls[0][0].where.roles).toEqual({ some: { role: { permissions: { has: 'approval:decide' } } } });
});

it('tells the requester of the decision, with the reason or why it was not made', async () => {
  const rejected = await buildApprovalMail(fake(request({ status: 'REJECTED', reason: 'Still in use' })).db, { tenantId: 't', approvalId: 'ap1', event: 'decided' }, 'x');
  expect(rejected).toMatchObject({ to: ['op@t.test'], subject: expect.stringMatching(/^Disposal rejected/) });
  expect(rejected!.text).toContain('Reason: Still in use');
  const failed = await buildApprovalMail(fake(request({ status: 'FAILED', error: 'Asset is already disposed' })).db, { tenantId: 't', approvalId: 'ap1', event: 'decided' }, 'x');
  expect(failed!.text).toContain('could not be made');
  expect(failed!.text).toContain('Asset is already disposed');
});

it('sends nothing for a missing request, nobody to ask, or a request already decided', async () => {
  expect(await buildApprovalMail(fake(null).db, { tenantId: 't', approvalId: 'x', event: 'requested' }, 'x')).toBeNull();
  expect(await buildApprovalMail(fake(request(), []).db, { tenantId: 't', approvalId: 'ap1', event: 'requested' }, 'x')).toBeNull();
  expect(await buildApprovalMail(fake(request({ status: 'APPROVED' })).db, { tenantId: 't', approvalId: 'ap1', event: 'requested' }, 'x')).toBeNull();
  expect(await buildApprovalMail(fake(request({ status: 'PENDING' })).db, { tenantId: 't', approvalId: 'ap1', event: 'decided' }, 'x')).toBeNull();
});
