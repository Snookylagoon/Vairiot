import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../app';
import { prisma } from '../../lib/prisma';

const app = createApp();
const TID = 'test-blind-audit-tenant';
const EMAIL = 'blind-auditor@vairiot.test';
const APPROVER_EMAIL = 'blind-approver@vairiot.test';
const PASS = 'TestPassword123x';
let auditorToken: string;
let approverToken: string;
let siteId: string;
let locationAId: string;
let locationBId: string;
let asset1Id: string;
let asset2Id: string;
let campaignId: string;

beforeAll(async () => {
  // Tenant with blindAudit feature flag enabled
  await prisma.tenant.upsert({
    where: { id: TID },
    update: { onboardingComplete: true, featureFlags: { blindAudit: true } },
    create: { id: TID, name: 'Blind Audit Test', slug: 'blind-audit-test', onboardingComplete: true, featureFlags: { blindAudit: true } },
  });

  // Roles
  const auditorRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: TID, name: 'Auditor' } },
    update: { permissions: ['asset:read', 'audit:write'] },
    create: { tenantId: TID, name: 'Auditor', permissions: ['asset:read', 'audit:write'] },
  });
  const approverRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: TID, name: 'Approver' } },
    update: { permissions: ['asset:read', 'audit:write', 'audit:approve'] },
    create: { tenantId: TID, name: 'Approver', permissions: ['asset:read', 'audit:write', 'audit:approve'] },
  });

  const hash = await bcrypt.hash(PASS, 12);

  // Auditor user
  const auditor = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: TID, email: EMAIL } },
    update: {},
    create: { tenantId: TID, email: EMAIL, name: 'Blind Auditor', passwordHash: hash },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: auditor.id, roleId: auditorRole.id } },
    update: {},
    create: { userId: auditor.id, roleId: auditorRole.id },
  });

  // Approver user (different person for segregation of duties)
  const approver = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: TID, email: APPROVER_EMAIL } },
    update: {},
    create: { tenantId: TID, email: APPROVER_EMAIL, name: 'Blind Approver', passwordHash: hash },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: approver.id, roleId: approverRole.id } },
    update: {},
    create: { userId: approver.id, roleId: approverRole.id },
  });

  // Login both
  const loginAuditor = await request(app).post('/api/v1/auth/login').send({ email: EMAIL, password: PASS, tenantId: TID });
  auditorToken = loginAuditor.body.accessToken;

  const loginApprover = await request(app).post('/api/v1/auth/login').send({ email: APPROVER_EMAIL, password: PASS, tenantId: TID });
  approverToken = loginApprover.body.accessToken;

  // Site + locations
  const site = await prisma.site.create({ data: { tenantId: TID, name: 'Blind Audit Site' } });
  siteId = site.id;
  const locA = await prisma.location.create({ data: { siteId, name: 'Zone A' } });
  const locB = await prisma.location.create({ data: { siteId, name: 'Zone B' } });
  locationAId = locA.id;
  locationBId = locB.id;

  // Assets (placed at location A)
  const a1 = await prisma.asset.create({
    data: { tenantId: TID, assetNumber: 'BLIND-001', name: 'Blind Laptop', rfidTag: 'RFID-BLIND-001', status: 'active', siteId, locationId: locationAId, condition: 'good' },
  });
  const a2 = await prisma.asset.create({
    data: { tenantId: TID, assetNumber: 'BLIND-002', name: 'Blind Monitor', rfidTag: 'RFID-BLIND-002', status: 'active', siteId, locationId: locationAId, condition: 'good' },
  });
  asset1Id = a1.id;
  asset2Id = a2.id;
});

afterAll(async () => {
  await prisma.auditAdjustment.deleteMany({ where: { reconciliationItem: { campaign: { tenantId: TID } } } });
  await prisma.auditReconciliationItem.deleteMany({ where: { campaign: { tenantId: TID } } });
  await prisma.auditZoneSubmission.deleteMany({ where: { campaign: { tenantId: TID } } });
  await prisma.auditSnapshotAsset.deleteMany({ where: { campaign: { tenantId: TID } } });
  await prisma.auditScanEvent.deleteMany({ where: { tenantId: TID } });
  await prisma.auditCampaign.deleteMany({ where: { tenantId: TID } });
  await prisma.auditEvent.deleteMany({ where: { tenantId: TID } });
  await prisma.asset.deleteMany({ where: { tenantId: TID } });
  await prisma.location.deleteMany({ where: { site: { tenantId: TID } } });
  await prisma.site.deleteMany({ where: { tenantId: TID } });
  await prisma.userRole.deleteMany({ where: { user: { tenantId: TID } } });
  await prisma.user.deleteMany({ where: { tenantId: TID } });
  await prisma.role.deleteMany({ where: { tenantId: TID } });
  await prisma.tenant.deleteMany({ where: { id: TID } });
  await prisma.$disconnect();
});

describe('Blind Audit — Feature flag', () => {
  it('rejects blind campaign when tenant lacks feature flag', async () => {
    // Temporarily remove flag
    await prisma.tenant.update({ where: { id: TID }, data: { featureFlags: {} } });
    const r = await request(app)
      .post('/api/v1/audits')
      .set('Authorization', `Bearer ${auditorToken}`)
      .send({ name: 'Should fail', mode: 'blind', siteId });
    expect(r.status).toBe(403);
    // Restore flag
    await prisma.tenant.update({ where: { id: TID }, data: { featureFlags: { blindAudit: true } } });
  });
});

describe('Blind Audit — Lifecycle', () => {
  it('creates a blind campaign requiring siteId', async () => {
    const noSite = await request(app)
      .post('/api/v1/audits')
      .set('Authorization', `Bearer ${auditorToken}`)
      .send({ name: 'No site', mode: 'blind' });
    expect(noSite.status).toBe(400);

    const r = await request(app)
      .post('/api/v1/audits')
      .set('Authorization', `Bearer ${auditorToken}`)
      .send({ name: 'Blind Audit Q2', mode: 'blind', siteId });
    expect(r.status).toBe(201);
    expect(r.body.mode).toBe('blind');
    campaignId = r.body.id;
  });

  it('starts campaign and creates snapshot', async () => {
    const r = await request(app)
      .post(`/api/v1/audits/${campaignId}/start`)
      .set('Authorization', `Bearer ${auditorToken}`);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('in_progress');

    // Verify snapshot was created
    const snapshots = await prisma.auditSnapshotAsset.findMany({ where: { campaignId } });
    expect(snapshots.length).toBe(2);
    expect(snapshots.map(s => s.assetNumber).sort()).toEqual(['BLIND-001', 'BLIND-002']);
  });
});

describe('Blind Audit — Concealment', () => {
  it('returns "recorded" result instead of found/unknown', async () => {
    // Known tag
    const r1 = await request(app)
      .post(`/api/v1/audits/${campaignId}/scans`)
      .set('Authorization', `Bearer ${auditorToken}`)
      .send({ tagValue: 'RFID-BLIND-001', locationId: locationAId, condition: 'good' });
    expect(r1.status).toBe(201);
    expect(r1.body.result).toBe('recorded');

    // Unknown tag
    const r2 = await request(app)
      .post(`/api/v1/audits/${campaignId}/scans`)
      .set('Authorization', `Bearer ${auditorToken}`)
      .send({ tagValue: 'RFID-SURPLUS-999', locationId: locationAId });
    expect(r2.status).toBe(201);
    expect(r2.body.result).toBe('recorded');
  });
});

describe('Blind Audit — Zone submission and locking', () => {
  it('submits zone A', async () => {
    const r = await request(app)
      .post(`/api/v1/audits/${campaignId}/zones/${locationAId}/submit`)
      .set('Authorization', `Bearer ${auditorToken}`);
    expect(r.status).toBe(201);
    expect(r.body.locationId).toBe(locationAId);
  });

  it('rejects scans to a submitted zone', async () => {
    const r = await request(app)
      .post(`/api/v1/audits/${campaignId}/scans`)
      .set('Authorization', `Bearer ${auditorToken}`)
      .send({ tagValue: 'RFID-BLIND-002', locationId: locationAId });
    expect(r.status).toBe(409);
  });

  it('rejects duplicate zone submission', async () => {
    const r = await request(app)
      .post(`/api/v1/audits/${campaignId}/zones/${locationAId}/submit`)
      .set('Authorization', `Bearer ${auditorToken}`);
    expect(r.status).toBe(409);
  });

  it('lists zone submissions', async () => {
    const r = await request(app)
      .get(`/api/v1/audits/${campaignId}/zones`)
      .set('Authorization', `Bearer ${auditorToken}`);
    expect(r.status).toBe(200);
    expect(r.body.length).toBe(1);
    expect(r.body[0].locationId).toBe(locationAId);
  });
});

describe('Blind Audit — Complete and reconciliation', () => {
  it('completes blind campaign', async () => {
    const r = await request(app)
      .post(`/api/v1/audits/${campaignId}/complete`)
      .set('Authorization', `Bearer ${auditorToken}`);
    expect(r.status).toBe(200);
  });

  it('reconciliation produces correct classifications', async () => {
    const r = await request(app)
      .get(`/api/v1/audits/${campaignId}/reconciliation`)
      .set('Authorization', `Bearer ${auditorToken}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);

    const classifications = r.body.map((i: { classification: string }) => i.classification);
    // Asset 1 scanned at correct location with correct condition -> verified
    expect(classifications).toContain('verified');
    // Asset 2 not scanned -> missing
    expect(classifications).toContain('missing');
    // Surplus tag scanned
    expect(classifications).toContain('surplus');
  });
});

describe('Blind Audit — Adjustments and segregation', () => {
  let missingItemId: string;

  it('posts an adjustment with audit:approve', async () => {
    const recon = await request(app)
      .get(`/api/v1/audits/${campaignId}/reconciliation`)
      .set('Authorization', `Bearer ${approverToken}`);
    const missingItem = recon.body.find((i: { classification: string }) => i.classification === 'missing');
    expect(missingItem).toBeDefined();
    missingItemId = missingItem.id;

    const r = await request(app)
      .post(`/api/v1/audits/${campaignId}/adjustments`)
      .set('Authorization', `Bearer ${approverToken}`)
      .send({
        reconciliationItemId: missingItemId,
        adjustmentType: 'no_action',
        justification: 'Confirmed missing — asset relocated to another building',
      });
    expect(r.status).toBe(201);
  });

  it('rejects adjustment without justification', async () => {
    const r = await request(app)
      .post(`/api/v1/audits/${campaignId}/adjustments`)
      .set('Authorization', `Bearer ${approverToken}`)
      .send({
        reconciliationItemId: missingItemId,
        adjustmentType: 'no_action',
      });
    expect(r.status).toBe(400);
  });

  it('lists adjustments', async () => {
    const r = await request(app)
      .get(`/api/v1/audits/${campaignId}/adjustments`)
      .set('Authorization', `Bearer ${approverToken}`);
    expect(r.status).toBe(200);
    expect(r.body.length).toBeGreaterThan(0);
  });
});

describe('Double-blind — second count and comparison', () => {
  let secondId: string;

  it('rejects linking to a non-completed campaign', async () => {
    // Create a new blind campaign that is still draft
    const draft = await request(app)
      .post('/api/v1/audits')
      .set('Authorization', `Bearer ${auditorToken}`)
      .send({ name: 'Draft for link test', mode: 'blind', siteId });
    expect(draft.status).toBe(201);
    const r = await request(app)
      .post('/api/v1/audits')
      .set('Authorization', `Bearer ${auditorToken}`)
      .send({ name: 'Should fail', mode: 'blind', linkedCampaignId: draft.body.id });
    expect(r.status).toBe(400);
  });

  it('creates a second count linked to the completed first', async () => {
    const r = await request(app)
      .post('/api/v1/audits')
      .set('Authorization', `Bearer ${auditorToken}`)
      .send({ name: 'Blind Audit Q2 — Count 2', mode: 'blind', linkedCampaignId: campaignId });
    expect(r.status).toBe(201);
    expect(r.body.linkedCampaignId).toBe(campaignId);
    expect(r.body.mode).toBe('blind');
    secondId = r.body.id;
  });

  it('second count inherits scope from first', async () => {
    const r = await request(app)
      .post(`/api/v1/audits/${secondId}/start`)
      .set('Authorization', `Bearer ${auditorToken}`);
    expect(r.status).toBe(200);

    // Snapshot should have the same assets
    const { PrismaClient } = require('@prisma/client');
    const db = new PrismaClient();
    const snapshots = await db.auditSnapshotAsset.findMany({ where: { campaignId: secondId } });
    expect(snapshots.length).toBe(2);
    await db.$disconnect();
  });

  it('runs the second count with different findings', async () => {
    // Scan both assets (asset 1 found at location B = misplaced, asset 2 found correctly)
    const s1 = await request(app)
      .post(`/api/v1/audits/${secondId}/scans`)
      .set('Authorization', `Bearer ${auditorToken}`)
      .send({ tagValue: 'RFID-BLIND-001', locationId: locationBId, condition: 'good' });
    expect(s1.status).toBe(201);
    expect(s1.body.result).toBe('recorded');

    const s2 = await request(app)
      .post(`/api/v1/audits/${secondId}/scans`)
      .set('Authorization', `Bearer ${auditorToken}`)
      .send({ tagValue: 'RFID-BLIND-002', locationId: locationAId, condition: 'good' });
    expect(s2.status).toBe(201);

    // Submit both zones
    await request(app)
      .post(`/api/v1/audits/${secondId}/zones/${locationAId}/submit`)
      .set('Authorization', `Bearer ${auditorToken}`);
    await request(app)
      .post(`/api/v1/audits/${secondId}/zones/${locationBId}/submit`)
      .set('Authorization', `Bearer ${auditorToken}`);

    // Complete
    const complete = await request(app)
      .post(`/api/v1/audits/${secondId}/complete`)
      .set('Authorization', `Bearer ${auditorToken}`);
    expect(complete.status).toBe(200);
  });

  it('comparison returns agreement rate and disagreements', async () => {
    const r = await request(app)
      .get(`/api/v1/audits/${secondId}/comparison`)
      .set('Authorization', `Bearer ${auditorToken}`);
    expect(r.status).toBe(200);
    expect(r.body.firstCampaign.id).toBe(campaignId);
    expect(r.body.secondCampaign.id).toBe(secondId);
    expect(r.body.totalItems).toBeGreaterThan(0);
    expect(typeof r.body.agreementRate).toBe('number');
    // First count: asset1=verified, asset2=missing, surplus tag
    // Second count: asset1=misplaced, asset2=verified
    // So there should be disagreements
    expect(r.body.disagreements).toBeGreaterThan(0);
  });

  it('comparison also works from the first campaign id', async () => {
    const r = await request(app)
      .get(`/api/v1/audits/${campaignId}/comparison`)
      .set('Authorization', `Bearer ${auditorToken}`);
    expect(r.status).toBe(200);
    expect(r.body.firstCampaign.id).toBe(campaignId);
    expect(r.body.secondCampaign.id).toBe(secondId);
  });
});

describe('Sighted campaigns — regression', () => {
  let sightedCampaignId: string;

  it('sighted campaign still works normally', async () => {
    const create = await request(app)
      .post('/api/v1/audits')
      .set('Authorization', `Bearer ${auditorToken}`)
      .send({ name: 'Sighted regression test' });
    expect(create.status).toBe(201);
    expect(create.body.mode).toBe('sighted');
    sightedCampaignId = create.body.id;

    const start = await request(app)
      .post(`/api/v1/audits/${sightedCampaignId}/start`)
      .set('Authorization', `Bearer ${auditorToken}`);
    expect(start.status).toBe(200);

    const scan = await request(app)
      .post(`/api/v1/audits/${sightedCampaignId}/scans`)
      .set('Authorization', `Bearer ${auditorToken}`)
      .send({ tagValue: 'RFID-BLIND-001' });
    expect(scan.status).toBe(201);
    expect(scan.body.result).toBe('found'); // NOT 'recorded'

    const complete = await request(app)
      .post(`/api/v1/audits/${sightedCampaignId}/complete`)
      .set('Authorization', `Bearer ${auditorToken}`);
    expect(complete.status).toBe(200);
    expect(complete.body.totalScanned).toBe(1);
  });
});
