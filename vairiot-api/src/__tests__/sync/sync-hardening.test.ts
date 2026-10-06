import bcrypt from 'bcryptjs';
import express from 'express';
import request from 'supertest';

import { createApp } from '../../app';
import { prisma } from '../../lib/prisma';
import { createSyncLimiter, isSyncRequest } from '../../middleware/rate-limit';
import { flushAuditEvents } from '../../services/audit-event.service';
import { clampCapturedAt } from '../../services/audit.service';

// S0.4: server-side behaviour that offline scanner fleets depend on.

const app = createApp();
const TID = 'test-sync-tenant-001';
const EMAIL = 'synctest@vairiot.test';
const PASS = 'TestPassword123!';
let token: string;
let tierId: string;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  await prisma.tenant.upsert({ where: { id: TID }, update: { onboardingComplete: true }, create: { id: TID, name: 'Sync Test Tenant', onboardingComplete: true } });
  const PERMS = ['asset:read', 'asset:write', 'asset:delete', 'audit:write'];
  const role = await prisma.role.upsert({ where: { tenantId_name: { tenantId: TID, name: 'Administrator' } }, update: { permissions: PERMS }, create: { tenantId: TID, name: 'Administrator', permissions: PERMS } });
  const hash = await bcrypt.hash(PASS, 12);
  const user = await prisma.user.upsert({ where: { tenantId_email: { tenantId: TID, email: EMAIL } }, update: {}, create: { tenantId: TID, email: EMAIL, name: 'Sync Tester', passwordHash: hash } });
  await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: {}, create: { userId: user.id, roleId: role.id } });
  // Tier names are an enum, so share the FREE tier like the other suites.
  const tier = await prisma.licenceTier.upsert({
    where: { name: 'FREE' }, update: {},
    create: { name: 'FREE', displayName: 'Free', maxAssets: 500, baseDevices: 1, pricePerYear: 0, isPerpetual: true },
  });
  tierId = tier.id;
  await prisma.licence.upsert({
    where: { id: `test-licence-${TID}` }, update: { status: 'active', tierId: tier.id },
    create: { id: `test-licence-${TID}`, tenantId: TID, tierId: tier.id, licenceNumber: `VAI-TEST-${TID}`, status: 'active', activatedAt: new Date(), paymentConfirmed: true },
  });
  const login = await request(app).post('/api/v1/auth/login').send({ email: EMAIL, password: PASS, tenantId: TID });
  token = login.body.accessToken;
});

afterAll(async () => {
  await flushAuditEvents();
  await prisma.auditScanEvent.deleteMany({ where: { tenantId: TID } });
  await prisma.auditCampaign.deleteMany({ where: { tenantId: TID } });
  await prisma.auditEvent.deleteMany({ where: { tenantId: TID } });
  await prisma.asset.deleteMany({ where: { tenantId: TID } });
  await prisma.deviceSlot.deleteMany({ where: { licence: { tenantId: TID } } });
  await prisma.licence.deleteMany({ where: { tenantId: TID } });
  await prisma.userRole.deleteMany({ where: { user: { tenantId: TID } } });
  await prisma.user.deleteMany({ where: { tenantId: TID } });
  await prisma.role.deleteMany({ where: { tenantId: TID } });
  await prisma.tenant.deleteMany({ where: { id: TID } });
  await prisma.$disconnect();
});

/** Temporarily caps the shared FREE tier (suites run in band), then restores it. */
async function withMaxAssets(maxAssets: number, fn: () => Promise<void>) {
  const { maxAssets: original } = await prisma.licenceTier.findUniqueOrThrow({ where: { id: tierId } });
  await prisma.licenceTier.update({ where: { id: tierId }, data: { maxAssets } });
  try {
    await fn();
  } finally {
    await prisma.licenceTier.update({ where: { id: tierId }, data: { maxAssets: original } });
  }
}

// ─── POST /assets idempotency ─────────────────────────────────────────────

describe('POST /assets with a clientRequestId', () => {
  it('creates with 201, and a replay returns the same asset with 200', async () => {
    const payload = { name: 'Sync pump', clientRequestId: 'sync-asset-req-001' };
    const first = await request(app).post('/api/v1/assets').set(auth()).send(payload);
    expect(first.status).toBe(201);
    const replay = await request(app).post('/api/v1/assets').set(auth()).send(payload);
    expect(replay.status).toBe(200);
    expect(replay.body.id).toBe(first.body.id);
    expect(await prisma.asset.count({ where: { tenantId: TID, clientRequestId: 'sync-asset-req-001' } })).toBe(1);
  });

  it('returns the existing asset even when the tenant is at its asset cap', async () => {
    const payload = { name: 'Capped replay', clientRequestId: 'sync-asset-req-cap' };
    const first = await request(app).post('/api/v1/assets').set(auth()).send(payload);
    expect(first.status).toBe(201);

    const live = await prisma.asset.count({ where: { tenantId: TID, deletedAt: null } });
    await withMaxAssets(live, async () => {
      const fresh = await request(app).post('/api/v1/assets').set(auth()).send({ name: 'Over the cap', clientRequestId: 'sync-asset-req-new' });
      expect(fresh.status).toBeGreaterThanOrEqual(400); // a genuinely new asset is still capped

      const replay = await request(app).post('/api/v1/assets').set(auth()).send(payload);
      expect(replay.status).toBe(200);
      expect(replay.body.id).toBe(first.body.id);
    });
  });

  it('rejects an oversized idempotency key', async () => {
    const r = await request(app).post('/api/v1/assets').set(auth()).send({ name: 'x', clientRequestId: 'k'.repeat(65) });
    expect(r.status).toBe(400);
  });
});

// ─── GET /assets?changedSince= ───────────────────────────────────────────

describe('GET /assets?changedSince= (delta sync)', () => {
  let unchangedId: string;
  let editedId: string;
  let deletedId: string;
  let since: string;

  beforeAll(async () => {
    const make = async (name: string) => (await request(app).post('/api/v1/assets').set(auth()).send({ name })).body.id as string;
    unchangedId = await make('Delta unchanged');
    editedId = await make('Delta edited');
    deletedId = await make('Delta deleted');
    // Make sure the cut-off is strictly after those creates.
    await new Promise((r) => setTimeout(r, 20));
    since = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 20));
    await request(app).patch(`/api/v1/assets/${editedId}`).set(auth()).send({ name: 'Delta edited (v2)' });
    await request(app).delete(`/api/v1/assets/${deletedId}`).set(auth());
  });

  it('returns only assets changed since the timestamp, plus deleted ids and serverTime', async () => {
    const r = await request(app).get('/api/v1/assets').query({ changedSince: since }).set(auth());
    expect(r.status).toBe(200);
    const ids = r.body.assets.map((a: { id: string }) => a.id);
    expect(ids).toContain(editedId);
    expect(ids).not.toContain(unchangedId);
    expect(ids).not.toContain(deletedId); // deletions are reported, not returned as assets
    expect(r.body.deletedIds).toEqual([deletedId]);
    expect(new Date(r.body.serverTime).getTime()).toBeGreaterThanOrEqual(new Date(since).getTime());
  });

  it('pages with changedUntil so edits during a sync land in the next delta', async () => {
    const page1 = await request(app).get('/api/v1/assets').query({ changedSince: since, pageSize: 1 }).set(auth());
    const until = page1.body.serverTime;
    await new Promise((r) => setTimeout(r, 20));
    // Edited after page 1 was taken: must not appear in this window.
    await request(app).patch(`/api/v1/assets/${unchangedId}`).set(auth()).send({ name: 'Edited mid-sync' });

    const again = await request(app).get('/api/v1/assets').query({ changedSince: since, changedUntil: until, pageSize: 1 }).set(auth());
    expect(again.body.total).toBe(page1.body.total);
    expect(again.body.assets.map((a: { id: string }) => a.id)).not.toContain(unchangedId);

    const next = await request(app).get('/api/v1/assets').query({ changedSince: until }).set(auth());
    expect(next.body.assets.map((a: { id: string }) => a.id)).toContain(unchangedId);
  });

  it('a timestamp in the future returns nothing', async () => {
    const r = await request(app).get('/api/v1/assets').query({ changedSince: '2999-01-01T00:00:00Z' }).set(auth());
    expect(r.status).toBe(200);
    expect(r.body.assets).toEqual([]);
    expect(r.body.deletedIds).toEqual([]);
  });

  it('rejects a timestamp that is not ISO-8601', async () => {
    const r = await request(app).get('/api/v1/assets').query({ changedSince: 'yesterday' }).set(auth());
    expect(r.status).toBe(400);
  });

  it('does not leak another tenant\'s changes', async () => {
    const r = await request(app).get('/api/v1/assets').query({ changedSince: '2000-01-01T00:00:00Z', pageSize: 200 }).set(auth());
    expect(r.body.assets.every((a: { tenantId: string }) => a.tenantId === TID)).toBe(true);
  });

  it('the plain list is unchanged when changedSince is absent', async () => {
    const r = await request(app).get('/api/v1/assets').set(auth());
    expect(r.status).toBe(200);
    expect(r.body).not.toHaveProperty('deletedIds');
    expect(r.body).toHaveProperty('assets');
  });
});

// ─── POST /audits/:id/scans ──────────────────────────────────────────────

describe('POST /audits/:id/scans replay and capturedAt clamp', () => {
  let campaignId: string;
  let startedAt: Date;

  beforeAll(async () => {
    const c = await request(app).post('/api/v1/audits').set(auth()).send({ name: 'Sync clamp audit' });
    campaignId = c.body.id;
    await request(app).post(`/api/v1/audits/${campaignId}/start`).set(auth());
    startedAt = (await prisma.auditCampaign.findUniqueOrThrow({ where: { id: campaignId } })).startedAt!;
  });

  const scan = (body: Record<string, unknown>) =>
    request(app).post(`/api/v1/audits/${campaignId}/scans`).set(auth()).send(body);

  it('a duplicate clientRequestId returns 200 with the existing event', async () => {
    const payload = { tagValue: 'SYNC-TAG-1', clientRequestId: 'sync-scan-req-001' };
    const first = await scan(payload);
    expect(first.status).toBe(201);
    const replay = await scan(payload);
    expect(replay.status).toBe(200);
    expect(replay.body.id).toBe(first.body.id);
    expect(replay.body.duplicate).toBe(true);
    expect(await prisma.auditScanEvent.count({ where: { clientRequestId: 'sync-scan-req-001' } })).toBe(1);
  });

  it('keeps a plausible capture time as sent', async () => {
    const capturedAt = new Date(Date.now() - 60_000).toISOString();
    const r = await scan({ tagValue: 'SYNC-TAG-2', clientRequestId: 'sync-scan-req-002', capturedAt });
    expect(new Date(r.body.capturedAt).toISOString()).toBe(capturedAt);
  });

  it('clamps a capture time from the future to now', async () => {
    const before = Date.now();
    const r = await scan({ tagValue: 'SYNC-TAG-3', clientRequestId: 'sync-scan-req-003', capturedAt: '2999-01-01T00:00:00Z' });
    const t = new Date(r.body.capturedAt).getTime();
    expect(t).toBeGreaterThanOrEqual(before - 1000);
    expect(t).toBeLessThanOrEqual(Date.now());
  });

  it('clamps a capture time long before the campaign to startedAt − 1 day', async () => {
    const r = await scan({ tagValue: 'SYNC-TAG-4', clientRequestId: 'sync-scan-req-004', capturedAt: '2001-01-01T00:00:00Z' });
    expect(new Date(r.body.capturedAt).getTime()).toBe(startedAt.getTime() - 24 * 3600 * 1000);
  });
});

describe('clampCapturedAt', () => {
  const now = new Date('2026-10-05T12:00:00Z');
  const started = new Date('2026-10-01T08:00:00Z');

  it('passes through times inside the window', () => {
    expect(clampCapturedAt('2026-10-03T09:30:00Z', started, now)?.toISOString()).toBe('2026-10-03T09:30:00.000Z');
  });
  it('allows a day of clock skew before the campaign started', () => {
    expect(clampCapturedAt('2026-09-30T09:00:00Z', started, now)?.toISOString()).toBe('2026-09-30T09:00:00.000Z');
    expect(clampCapturedAt('2026-09-29T00:00:00Z', started, now)?.toISOString()).toBe('2026-09-30T08:00:00.000Z');
  });
  it('never returns a time after now', () => {
    expect(clampCapturedAt('2026-10-05T12:00:01Z', started, now)?.toISOString()).toBe(now.toISOString());
  });
  it('ignores missing or unparseable input', () => {
    expect(clampCapturedAt(undefined, started, now)).toBeUndefined();
    expect(clampCapturedAt('not a date', started, now)).toBeUndefined();
  });
  it('falls back to a 90-day window when the campaign has no start time', () => {
    expect(clampCapturedAt('2020-01-01T00:00:00Z', null, now)?.toISOString()).toBe('2026-07-07T12:00:00.000Z');
  });
});

// ─── Compression ─────────────────────────────────────────────────────────

describe('response compression', () => {
  it('gzips JSON when the client accepts it', async () => {
    const r = await request(app).get('/api/openapi.json').set('Accept-Encoding', 'gzip');
    expect(r.status).toBe(200);
    expect(r.headers['content-encoding']).toBe('gzip');
  });
  it('sends plain JSON to clients that do not ask for gzip', async () => {
    const r = await request(app).get('/api/openapi.json').set('Accept-Encoding', 'identity');
    expect(r.headers['content-encoding']).toBeUndefined();
  });
});

// ─── Rate limiting ───────────────────────────────────────────────────────

describe('sync rate limiting', () => {
  const post = (url: string) => ({ method: 'POST', originalUrl: url }) as express.Request;

  it('recognises exactly the offline-sync routes', () => {
    expect(isSyncRequest(post('/api/v1/assets'))).toBe(true);
    expect(isSyncRequest(post('/api/v1/assets?x=1'))).toBe(true);
    expect(isSyncRequest(post('/api/v1/audits/abc/scans'))).toBe(true);
    expect(isSyncRequest(post('/api/v1/scan-sessions'))).toBe(true);
    expect(isSyncRequest(post('/api/v1/assets/abc/photos'))).toBe(true);
    expect(isSyncRequest(post('/api/v1/maintenance/abc/photos'))).toBe(true);

    expect(isSyncRequest(post('/api/v1/auth/login'))).toBe(false);
    expect(isSyncRequest(post('/api/v1/assets/import'))).toBe(false);
    expect(isSyncRequest(post('/api/v1/audits/abc/complete'))).toBe(false);
    expect(isSyncRequest({ method: 'GET', originalUrl: '/api/v1/assets' } as express.Request)).toBe(false);
  });

  // A mini app with the real limiter: users are identified the way
  // `authenticate` does it, and every request comes from the same NAT'd IP.
  function fleetApp(limit: number) {
    const mini = express();
    mini.use((req, _res, next) => {
      req.user = { sub: String(req.headers['x-user']), tenantId: 't1' } as never;
      next();
    });
    mini.use(createSyncLimiter(limit));
    mini.post('/api/v1/audits/:id/scans', (_req, res) => { res.status(201).json({}); });
    mini.get('/api/v1/assets', (_req, res) => { res.json({}); });
    return mini;
  }

  it('limits each user separately even behind one IP', async () => {
    const mini = fleetApp(3);
    for (let i = 0; i < 3; i++) {
      expect((await request(mini).post('/api/v1/audits/c1/scans').set('x-user', 'scanner-a')).status).toBe(201);
    }
    const blocked = await request(mini).post('/api/v1/audits/c1/scans').set('x-user', 'scanner-a');
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
    // Same IP, different user: its own budget.
    expect((await request(mini).post('/api/v1/audits/c1/scans').set('x-user', 'scanner-b')).status).toBe(201);
  });

  it('does not count non-sync requests', async () => {
    const mini = fleetApp(1);
    for (let i = 0; i < 5; i++) {
      expect((await request(mini).get('/api/v1/assets').set('x-user', 'scanner-a')).status).toBe(200);
    }
    expect((await request(mini).post('/api/v1/audits/c1/scans').set('x-user', 'scanner-a')).status).toBe(201);
  });
});
