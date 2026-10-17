import request from 'supertest';

import { createApp } from '../../app';
import { signAccessToken } from '../../lib/jwt';
import { prisma } from '../../lib/prisma';
import { ruleFor } from '../../services/approvals/approval.service';
import { flushAuditEvents } from '../../services/audit-event.service';
import { ensureTestLicence, removeTestLicence } from '../helpers/test-licence';

// S3.1 (stage 3.2, D22): maker-checker approvals. Gate (test plan §8.4): a
// Field Operator's disposal request reaches Finance's inbox; the requester
// cannot approve it; approval creates the Disposal. Plus: rules in tiers,
// the other actions applied on approval, rejection, withdrawal, a failed
// apply, and no rules meaning no change.

const app = createApp();
const TID = 'test-maker-checker';
const users: Record<string, string> = {};
const roles: Record<string, string> = {};
const PERMS: Record<string, string[]> = {
  operator: ['asset:read', 'asset:write', 'audit:read', 'audit:approve'],
  finance: ['asset:read', 'approval:read', 'approval:decide', 'accounting:read', 'accounting:write', 'accounting:approve'],
  inventory: ['asset:read', 'asset:write', 'approval:read', 'approval:decide'],
  admin: ['asset:read', 'asset:write', 'company:manage', 'approval:read', 'accounting:read', 'accounting:approve'],
};
const as = (who: string) => ({ Authorization: `Bearer ${signAccessToken({ sub: users[who], tenantId: TID, email: `${who}@mc.test`, roles: [who], permissions: PERMS[who] })}` });

async function asset(name: string, cost = 1000) {
  return (await request(app).post('/api/v1/assets').set(as('admin')).send({ name, purchaseCost: cost, assetClassId: roles.classId })).body;
}

beforeAll(async () => {
  await prisma.tenant.upsert({ where: { id: TID }, update: { featureFlags: { ipsas: true }, onboardingComplete: true }, create: { id: TID, name: TID, featureFlags: { ipsas: true }, onboardingComplete: true } });
  await ensureTestLicence(TID);
  for (const who of Object.keys(PERMS)) {
    const role = await prisma.role.create({ data: { tenantId: TID, name: who, permissions: PERMS[who] } });
    roles[who] = role.id;
    const u = await prisma.user.create({ data: { tenantId: TID, email: `${who}@mc.test`, name: `The ${who}` } });
    users[who] = u.id;
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
  }
  roles.classId = (await prisma.assetClass.create({ data: { tenantId: TID, code: 'SGN', name: 'Signs', ipsasClass: 'INFRASTRUCTURE', capitalisationThreshold: 500, defaultUsefulLifeMonths: 84 } })).id;
  await prisma.site.create({ data: { tenantId: TID, name: 'Depot' } });
  const rules = [
    { action: 'DISPOSE', minAmount: 0, approverRoleId: roles.finance },
    { action: 'TRANSFER', minAmount: 0, approverRoleId: roles.inventory },
    { action: 'CAPITALISE', minAmount: 0, approverRoleId: roles.finance },
    { action: 'WRITE_OFF', minAmount: 0, approverRoleId: roles.inventory },
    { action: 'WRITE_OFF', minAmount: 5000, approverRoleId: roles.finance },
  ];
  expect((await request(app).put('/api/v1/approvals/rules').set(as('admin')).send({ rules })).status).toBe(200);
});

afterAll(async () => {
  await flushAuditEvents();
  await prisma.auditEvent.deleteMany({ where: { tenantId: TID } });
  await prisma.approvalRequest.deleteMany({ where: { tenantId: TID } });
  await prisma.approvalRule.deleteMany({ where: { tenantId: TID } });
  await prisma.auditCampaign.deleteMany({ where: { tenantId: TID } });
  await prisma.transfer.deleteMany({ where: { tenantId: TID } });
  await prisma.disposal.deleteMany({ where: { tenantId: TID } });
  await prisma.asset.deleteMany({ where: { tenantId: TID } });
  await prisma.assetClass.deleteMany({ where: { tenantId: TID } });
  await prisma.site.deleteMany({ where: { tenantId: TID } });
  await removeTestLicence(TID);
  await prisma.userRole.deleteMany({ where: { user: { tenantId: TID } } });
  await prisma.user.deleteMany({ where: { tenantId: TID } });
  await prisma.role.deleteMany({ where: { tenantId: TID } });
  await prisma.tenant.deleteMany({ where: { id: TID } });
  await prisma.$disconnect();
});

const DISPOSAL = { disposalDate: '2026-10-17', disposalMethod: 'scrap', disposalReason: 'Bent by a lorry' };

describe('S3.1 gate', () => {
  let id = '';
  let assetId = '';

  it('a Field Operator’s disposal request changes nothing and reaches Finance’s inbox', async () => {
    assetId = (await asset('Stop sign')).id;
    const r = await request(app).post(`/api/v1/assets/${assetId}/dispose`).set(as('operator')).send(DISPOSAL);
    expect(r.status).toBe(202);
    expect(r.body.approvalRequest).toMatchObject({ action: 'DISPOSE', status: 'PENDING', requestedBy: users.operator, summary: expect.stringContaining('Stop sign') });
    id = r.body.approvalRequest.id;
    expect(await prisma.disposal.count({ where: { assetId } })).toBe(0);
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: assetId } })).status).not.toBe('disposed');
    const inbox = (await request(app).get('/api/v1/approvals/inbox').set(as('finance'))).body;
    expect(inbox.requests.map((x: { id: string }) => x.id)).toContain(id);
    expect((await request(app).get('/api/v1/approvals/inbox').set(as('inventory'))).body.requests.map((x: { id: string }) => x.id)).not.toContain(id);
    expect((await request(app).post(`/api/v1/assets/${assetId}/dispose`).set(as('operator')).send(DISPOSAL)).body.code).toBe('APPROVAL_PENDING');
  });

  it('the requester cannot approve it, nor someone outside the rule’s role', async () => {
    const operatorWithDecide = { Authorization: `Bearer ${signAccessToken({ sub: users.operator, tenantId: TID, email: 'operator@mc.test', roles: ['operator'], permissions: [...PERMS.operator, 'approval:decide'] })}` };
    expect((await request(app).post(`/api/v1/approvals/${id}/approve`).set(operatorWithDecide)).status).toBe(403);
    expect((await request(app).post(`/api/v1/approvals/${id}/approve`).set(as('inventory'))).body.error).toMatch(/another role/);
    expect((await request(app).post(`/api/v1/approvals/${id}/approve`).set(as('operator'))).status).toBe(403);
  });

  it('Finance’s approval creates the Disposal, recording the approver', async () => {
    const r = await request(app).post(`/api/v1/approvals/${id}/approve`).set(as('finance')).send({});
    expect(r.body).toMatchObject({ status: 'APPROVED', decidedBy: users.finance, result: { assetId } });
    const disposal = await prisma.disposal.findUniqueOrThrow({ where: { assetId } });
    expect(disposal).toMatchObject({ createdBy: users.operator, approvedBy: 'The finance', disposalMethod: 'scrap' });
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: assetId } })).status).toBe('disposed');
    expect((await request(app).post(`/api/v1/approvals/${id}/reject`).set(as('finance')).send({ reason: 'x' })).body.code).toBe('NOT_PENDING');
  });
});

describe('the other actions', () => {
  it('a transfer is applied on approval by the Inventory Manager', async () => {
    const a = await asset('Bench');
    const site = await prisma.site.findFirstOrThrow({ where: { tenantId: TID } });
    const r = await request(app).post('/api/v1/transfers').set(as('operator')).send({ assetId: a.id, toSiteId: site.id, toCustodian: 'Parks', reason: 'Moved' });
    expect(r.status).toBe(202);
    const ok = await request(app).post(`/api/v1/approvals/${r.body.approvalRequest.id}/approve`).set(as('inventory'));
    expect(ok.body.status).toBe('APPROVED');
    const t = await prisma.transfer.findFirstOrThrow({ where: { assetId: a.id } });
    expect(t).toMatchObject({ approvedBy: 'The inventory', toCustodian: 'Parks' });
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: a.id } })).custodian).toBe('Parks');
  });

  it('capitalising an expensed item is applied on Finance’s approval; other overrides are not held', async () => {
    const cheap = await asset('Bracket', 200);
    expect(cheap.recognitionStatus).toBe('EXPENSED');
    const r = await request(app).put(`/api/v1/accounting/assets/${cheap.id}/recognition`).set(as('admin')).send({ status: 'RECOGNISED', reason: 'Part of the junction' });
    expect(r.status).toBe(202);
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: cheap.id } })).recognitionStatus).toBe('EXPENSED');
    await request(app).post(`/api/v1/approvals/${r.body.approvalRequest.id}/approve`).set(as('finance'));
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: cheap.id } })).recognitionStatus).toBe('RECOGNISED');
    const back = await request(app).put(`/api/v1/accounting/assets/${cheap.id}/recognition`).set(as('admin')).send({ status: 'EXPENSED', reason: 'Back to expense' });
    expect(back.status).toBe(200);
  });

  it('a write-off goes to the Inventory Manager below GEL 5,000 and to Finance above, and is applied on approval', async () => {
    const big = await asset('Controller', 9000);
    const campaign = await prisma.auditCampaign.create({ data: { tenantId: TID, name: 'Count', createdBy: users.admin, status: 'completed' } });
    const snap = await prisma.auditSnapshotAsset.create({ data: { campaignId: campaign.id, assetId: big.id, assetNumber: big.assetNumber, name: big.name } });
    const item = await prisma.auditReconciliationItem.create({ data: { campaignId: campaign.id, classification: 'missing', snapshotAssetId: snap.id } });
    const r = await request(app).post(`/api/v1/audits/${campaign.id}/adjustments`).set(as('operator'))
      .send({ reconciliationItemId: item.id, adjustmentType: 'write_off', justification: 'Not found in two counts' });
    expect(r.status).toBe(202);
    expect(r.body.approvalRequest).toMatchObject({ action: 'WRITE_OFF', amount: expect.anything() });
    expect((await request(app).post(`/api/v1/approvals/${r.body.approvalRequest.id}/approve`).set(as('inventory'))).status).toBe(403);
    expect((await request(app).post(`/api/v1/approvals/${r.body.approvalRequest.id}/approve`).set(as('finance'))).body.status).toBe('APPROVED');
    expect(await prisma.auditAdjustment.count({ where: { reconciliationItemId: item.id, adjustmentType: 'write_off', postedBy: users.operator } })).toBe(1);
    expect((await ruleFor(TID, 'WRITE_OFF', 4999.99))?.approverRoleId).toBe(roles.inventory);
    expect((await ruleFor(TID, 'WRITE_OFF', 5000))?.approverRoleId).toBe(roles.finance);
    expect(await ruleFor(TID, 'REGISTER_NEW', 1)).toBeNull();
  });
});

describe('decisions', () => {
  it('a rejection needs a reason and changes nothing; the requester can withdraw, nobody else', async () => {
    const a = await asset('Lamp');
    const req1 = (await request(app).post(`/api/v1/assets/${a.id}/dispose`).set(as('operator')).send(DISPOSAL)).body.approvalRequest;
    expect((await request(app).post(`/api/v1/approvals/${req1.id}/reject`).set(as('finance')).send({})).status).toBe(400);
    expect((await request(app).post(`/api/v1/approvals/${req1.id}/reject`).set(as('finance')).send({ reason: 'Still in use' })).body).toMatchObject({ status: 'REJECTED', reason: 'Still in use' });
    expect(await prisma.disposal.count({ where: { assetId: a.id } })).toBe(0);
    const req2 = (await request(app).post(`/api/v1/assets/${a.id}/dispose`).set(as('operator')).send(DISPOSAL)).body.approvalRequest;
    expect((await request(app).post(`/api/v1/approvals/${req2.id}/cancel`).set(as('finance'))).status).toBe(403);
    expect((await request(app).post(`/api/v1/approvals/${req2.id}/cancel`).set(as('operator'))).body.status).toBe('CANCELLED');
    const mine = (await request(app).get('/api/v1/approvals/mine').set(as('operator'))).body.map((x: { status: string }) => x.status);
    expect(mine).toEqual(expect.arrayContaining(['APPROVED', 'REJECTED', 'CANCELLED']));
  });

  it('records an approval that cannot be applied as FAILED, with the reason', async () => {
    const a = await asset('Pole');
    const pending = (await request(app).post(`/api/v1/assets/${a.id}/dispose`).set(as('operator')).send(DISPOSAL)).body.approvalRequest;
    await prisma.asset.update({ where: { id: a.id }, data: { status: 'disposed' } }); // disposed some other way meanwhile
    const r = await request(app).post(`/api/v1/approvals/${pending.id}/approve`).set(as('finance'));
    expect(r.body).toMatchObject({ status: 'FAILED', error: 'Asset is already disposed' });
  });

  it('lists the ledger’s own post steps in an approver’s inbox', async () => {
    const period = await prisma.accountingPeriod.create({ data: { tenantId: TID, year: 2026, month: 10 } });
    await prisma.depreciationRun.create({ data: { tenantId: TID, periodId: period.id, preparedBy: users.admin, jobState: 'DONE' } });
    const inbox = (await request(app).get('/api/v1/approvals/inbox').set(as('finance'))).body;
    expect(inbox.runs).toHaveLength(1);
    expect(inbox.count).toBe(inbox.requests.length + 1 + inbox.impairments.length);
    await prisma.depreciationRun.deleteMany({ where: { tenantId: TID } });
    await prisma.accountingPeriod.deleteMany({ where: { tenantId: TID } });
  });
});

describe('rules', () => {
  it('refuses a self-approved disposal rule and a role from elsewhere', async () => {
    expect((await request(app).put('/api/v1/approvals/rules').set(as('admin')).send({ rules: [{ action: 'DISPOSE', minAmount: 0, approverRoleId: null, requireDifferentUser: false }] })).status).toBe(400);
    expect((await request(app).put('/api/v1/approvals/rules').set(as('admin')).send({ rules: [{ action: 'DISPOSE', minAmount: 0, approverRoleId: 'nope' }] })).status).toBe(404);
    expect((await request(app).put('/api/v1/approvals/rules').set(as('finance')).send({ rules: [] })).status).toBe(403);
  });

  it('without rules, an action proceeds at once as before', async () => {
    const a = await asset('Kerb');
    expect((await request(app).put('/api/v1/approvals/rules').set(as('admin')).send({ rules: [] })).status).toBe(200);
    expect((await request(app).get('/api/v1/approvals/rules').set(as('admin'))).body.every((r: { active: boolean }) => !r.active)).toBe(true);
    const r = await request(app).post(`/api/v1/assets/${a.id}/dispose`).set(as('operator')).send(DISPOSAL);
    expect(r.status).toBe(200);
    expect(await prisma.disposal.count({ where: { assetId: a.id } })).toBe(1);
  });
});
