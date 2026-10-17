import request from 'supertest';
import { ALL_PERMISSIONS } from 'vairiot-shared';

import { createApp } from '../../app';
import { apiSpec } from '../../lib/api-spec';
import { signAccessToken } from '../../lib/jwt';
import { prisma } from '../../lib/prisma';
import { flushAuditEvents } from '../../services/audit-event.service';
import { ensureTestLicence, removeTestLicence } from '../helpers/test-licence';

// W7 (stage 2.15, Phase 2 plan §3 "Tenancy"): with row-level security on every
// tenant table, a request in one tenant reads nothing of another's, over every
// route. Tenant B's rows all carry a marker; tenant A, holding every
// permission and every module, calls each documented GET route, with no
// parameters and with B's ids put into the path, and no response may contain
// the marker. Routes that call the report service are left out (it is mocked
// elsewhere); everything else answers from this database.

jest.mock('axios');
const app = createApp();
const A = 'test-xt-tenant-a';
const B = 'test-xt-tenant-b';
const MARK = 'XTMARKB7';
let userA = '';
let userB = '';
const ids: Record<string, string> = {};
const FLAGS = { gis: true, ipsas: true, reconciliation: true, blindAudit: true };

const auth = (tenantId = A, sub = userA) => ({ Authorization: `Bearer ${signAccessToken({ sub, tenantId, email: 'x@xt.test', roles: ['Company Admin'], permissions: [...ALL_PERMISSIONS] })}` });

beforeAll(async () => {
  for (const id of [A, B]) {
    await prisma.tenant.upsert({ where: { id }, update: { featureFlags: FLAGS, onboardingComplete: true }, create: { id, name: id === B ? `Tenant ${MARK}` : id, featureFlags: FLAGS, onboardingComplete: true } });
    await ensureTestLicence(id);
  }
  userA = (await prisma.user.create({ data: { tenantId: A, email: 'a@xt.test', name: 'A' } })).id;
  const b = await prisma.user.create({ data: { tenantId: B, email: `b-${MARK}@xt.test`, name: `User ${MARK}` } });
  userB = b.id;
  const site = await prisma.site.create({ data: { tenantId: B, name: `Site ${MARK}` } });
  const location = await prisma.location.create({ data: { siteId: site.id, name: `Room ${MARK}` } });
  const category = await prisma.category.create({ data: { tenantId: B, name: `Category ${MARK}` } });
  const cls = await prisma.assetClass.create({ data: { tenantId: B, code: 'XTB', name: `Class ${MARK}`, ipsasClass: 'OTHER', capitalisationThreshold: 1 } });
  const asset = await prisma.asset.create({
    data: { tenantId: B, assetNumber: `AST-${MARK}`, name: `Asset ${MARK}`, siteId: site.id, locationId: location.id, categoryId: category.id, assetClassId: cls.id, latitude: 41.7, longitude: 44.8, custodian: `Custodian ${MARK}` },
  });
  await prisma.assetSecondaryIdentifier.create({ data: { tenantId: B, assetId: asset.id, scheme: 'FINANCE_REF', value: `F-${MARK}` } });
  const campaign = await prisma.auditCampaign.create({ data: { tenantId: B, name: `Audit ${MARK}`, createdBy: userB } as never });
  const hook = await prisma.webhook.create({ data: { tenantId: B, name: `Hook ${MARK}`, url: `https://example.org/${MARK}`, events: ['asset.created'], secret: `s-${MARK}`, createdBy: userB } as never });
  const batch = await prisma.importBatch.create({ data: { tenantId: B, fileName: `${MARK}.xlsx`, storageKey: `k/${MARK}`, fileSize: 1, createdBy: userB } });
  const period = await prisma.accountingPeriod.create({ data: { tenantId: B, year: 2026, month: 10 } });
  await prisma.auditEvent.create({ data: { tenantId: B, entityType: 'asset', entityId: asset.id, action: `created-${MARK}` } });
  Object.assign(ids, { assets: asset.id, sites: site.id, categories: category.id, users: userB, audits: campaign.id, webhooks: hook.id, imports: batch.id, classes: cls.id, periods: period.id, locations: location.id });
});

afterAll(async () => {
  await flushAuditEvents();
  for (const id of [A, B]) {
    await prisma.auditEvent.deleteMany({ where: { tenantId: id } });
    await prisma.importBatch.deleteMany({ where: { tenantId: id } });
    await prisma.accountingPeriod.deleteMany({ where: { tenantId: id } });
    await prisma.webhook.deleteMany({ where: { tenantId: id } });
    await prisma.auditCampaign.deleteMany({ where: { tenantId: id } });
    await prisma.asset.deleteMany({ where: { tenantId: id } });
    await prisma.assetClass.deleteMany({ where: { tenantId: id } });
    await prisma.category.deleteMany({ where: { tenantId: id } });
    await prisma.location.deleteMany({ where: { site: { tenantId: id } } });
    await prisma.site.deleteMany({ where: { tenantId: id } });
    await removeTestLicence(id);
    await prisma.user.deleteMany({ where: { tenantId: id } });
  }
  await prisma.tenant.deleteMany({ where: { id: { in: [A, B] } } });
  await prisma.$disconnect();
});

/** B's id for a path parameter, judged from the segment before it. */
function idFor(segments: string[], i: number): string {
  const before = segments[i - 1] ?? '';
  const key = Object.keys(ids).find((k) => before === k || before.startsWith(k.slice(0, -1)));
  return key ? ids[key] : ids.assets;
}

const SKIP = /\/reports\/export|\/download|\/admin\/platform|\/admin\/(mobile|ios)-releases|\/ios\/|\/mobile\/|\/auth\/|\/health|\/public\//;

it('returns nothing of another tenant from any documented GET route', async () => {
  const paths = Object.entries(apiSpec.paths as Record<string, Record<string, unknown>>)
    .filter(([p, ops]) => ops.get && !SKIP.test(p)).map(([p]) => p);
  expect(paths.length).toBeGreaterThan(40);
  const leaks: string[] = [];
  let called = 0;
  for (const p of paths) {
    const segments = p.split('/');
    const url = '/api/v1' + segments.map((s, i) => (/^\{.+\}$/.test(s) ? idFor(segments, i) : s)).join('/');
    const r = await request(app).get(url).set(auth()).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = []; res.on('data', (c: Buffer) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    called += 1;
    if ((r.body as Buffer).toString('utf8').includes(MARK)) leaks.push(`${url} → ${r.status}`);
  }
  expect(leaks).toEqual([]);
  expect(called).toBe(paths.length);
}, 120_000);

it('sees the marker as tenant B, so the check above would catch a leak', async () => {
  for (const url of ['/api/v1/assets', `/api/v1/assets/${ids.assets}`, '/api/v1/sites', '/api/v1/users', '/api/v1/imports', '/api/v1/accounting/classes']) {
    expect([url, (await request(app).get(url).set(auth(B, userB))).text.includes(MARK)]).toEqual([url, true]);
  }
});

it('cannot change another tenant’s rows by id', async () => {
  expect((await request(app).patch(`/api/v1/assets/${ids.assets}`).set(auth()).send({ name: 'Taken' })).status).toBe(404);
  expect((await request(app).delete(`/api/v1/categories/${ids.categories}`).set(auth())).status).toBe(404);
  expect((await request(app).post(`/api/v1/imports/${ids.imports}/cancel`).set(auth())).status).toBe(404);
  const asset = await prisma.asset.findUniqueOrThrow({ where: { id: ids.assets } });
  expect(asset.name).toBe(`Asset ${MARK}`);
});
