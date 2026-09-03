import bcrypt from 'bcryptjs';
import request from 'supertest';

import { createApp } from '../../app';
import { prisma } from '../../lib/prisma';
import { flushAuditEvents } from '../../services/audit-event.service';

const app = createApp();
const TID = 'test-gs1-tenant-001';
const TID_B = 'test-gs1-tenant-002';
const EMAIL = 'gs1test@vairiot.test';
const PASS = 'TestPassword123!';
// GS1 documentation example prefix (spec §3.4)
const PREFIX = '9521141';
const TID_HEX = 'E280699500005012345678AB';

let token: string;
let assetId: string;
let tagId: string;
let prefixId: string;

async function seedTenant(tenantId: string, name: string) {
  await prisma.tenant.upsert({
    where: { id: tenantId },
    update: { onboardingComplete: true },
    create: { id: tenantId, name, onboardingComplete: true },
  });
}

beforeAll(async () => {
  await seedTenant(TID, 'GS1 Test Tenant');
  await seedTenant(TID_B, 'GS1 Other Tenant');
  const PERMS = [
    'asset:read', 'asset:write', 'asset:delete',
    'gs1:admin', 'tag:commission', 'device:manage', 'scan:execute',
  ];
  const role = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: TID, name: 'Administrator' } },
    update: { permissions: PERMS },
    create: { tenantId: TID, name: 'Administrator', permissions: PERMS },
  });
  const hash = await bcrypt.hash(PASS, 12);
  const user = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: TID, email: EMAIL } },
    update: {},
    create: { tenantId: TID, email: EMAIL, name: 'GS1 Tester', passwordHash: hash },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });
  const tier = await prisma.licenceTier.upsert({
    where: { name: 'FREE' },
    update: {},
    create: { name: 'FREE', displayName: 'Free', maxAssets: 500, baseDevices: 1, pricePerYear: 0, isPerpetual: true },
  });
  await prisma.licence.upsert({
    where: { id: `test-licence-${TID}` },
    update: { status: 'active' },
    create: { id: `test-licence-${TID}`, tenantId: TID, tierId: tier.id, licenceNumber: `VAI-TEST-${TID}`, status: 'active', activatedAt: new Date(), paymentConfirmed: true },
  });
  const login = await request(app).post('/api/v1/auth/login').send({ email: EMAIL, password: PASS, tenantId: TID });
  token = login.body.accessToken;
});

afterAll(async () => {
  await flushAuditEvents(); // let in-flight audit writes land before deleting the tenant
  // Hard-deleting the assets cascades bindings, prints and events; deleting
  // the tenants cascades identification, prefixes, tags and allocations.
  for (const tid of [TID, TID_B]) {
    await prisma.auditEvent.deleteMany({ where: { tenantId: tid } });
    await prisma.asset.deleteMany({ where: { tenantId: tid } });
    await prisma.licence.deleteMany({ where: { tenantId: tid } });
    await prisma.userRole.deleteMany({ where: { user: { tenantId: tid } } });
    await prisma.user.deleteMany({ where: { tenantId: tid } });
    await prisma.role.deleteMany({ where: { tenantId: tid } });
    await prisma.tenant.deleteMany({ where: { id: tid } });
  }
  await prisma.$disconnect();
});

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('Identification', () => {
  it('provisions the INTERNAL identification block on first read', async () => {
    const r = await request(app).get('/api/v1/identification').set(auth());
    expect(r.status).toBe(200);
    expect(r.body.mode).toBe('INTERNAL');
    expect(r.body.slug).toBeTruthy();
    expect(r.body.activePrefix).toBeNull();
  });

  it('updates tenant mark and settling period', async () => {
    const r = await request(app).patch('/api/v1/identification').set(auth())
      .send({ tenantMark: 'ACME', settlingPeriodDays: 30 });
    expect(r.status).toBe(200);
    expect(r.body.tenantMark).toBe('ACME');
    expect(r.body.settlingPeriodDays).toBe(30);
  });
});

describe('Asset creation allocates an IAR', () => {
  it('creates an asset with a valid server IAR and no GIAI in INTERNAL mode', async () => {
    const r = await request(app).post('/api/v1/assets').set(auth()).send({ name: 'GS1 Asset One' });
    expect(r.status).toBe(201);
    assetId = r.body.id;
    expect(r.body.individualAssetReference).toMatch(/^1\d{11}$/);
    expect(r.body.allocationAuthority).toBe('SERVER');
    expect(r.body.giai).toBeNull();
  });

  it('rejects a caller-supplied reference', async () => {
    const r = await request(app).post('/api/v1/assets').set(auth())
      .send({ name: 'Sneaky', individualAssetReference: '100000123454' });
    expect(r.status).toBe(201);
    // The field is ignored — the server allocates its own.
    expect(r.body.individualAssetReference).not.toBe('100000123454');
  });

  it('validates identifiers', async () => {
    const r = await request(app).get('/api/v1/identifiers/100000123454/validate').set(auth());
    expect(r.body).toMatchObject({ valid: true, authority: 'SERVER', marker: '1', checkDigit: 4 });
    const bad = await request(app).get('/api/v1/identifiers/100000123455/validate').set(auth());
    expect(bad.body.valid).toBe(false);
  });
});

describe('Tag commissioning (INTERNAL mode → TID-96)', () => {
  it('commissions a tag with the serialised TID as EPC', async () => {
    const r = await request(app).post('/api/v1/tags/commission').set(auth())
      .send({ assetId, tidHex: TID_HEX, chipModel: 'Impinj M750', formFactor: 'LABEL' });
    expect(r.status).toBe(200);
    tagId = r.body.tagId;
    expect(r.body.epcHex).toBe(TID_HEX);
    expect(r.body.epcScheme).toBe('TID96');
    expect(r.body.writePlan.permalockAllowed).toBe(false);
  });

  it('rejects a non-serialised TID (procurement gate)', async () => {
    const r = await request(app).post('/api/v1/tags/commission').set(auth())
      .send({ assetId, tidHex: 'E080699500005012345678AB' });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });

  it('verify mismatch quarantines the tag and creates no binding', async () => {
    const r = await request(app).post(`/api/v1/tags/${tagId}/verify`).set(auth())
      .send({ assetId, readEpcHex: 'E2FFFFFFFFFFFFFFFFFFFFFF', readTidHex: TID_HEX });
    expect(r.status).toBe(409);
    const tag = await prisma.rfidTag.findUnique({ where: { id: tagId } });
    expect(tag!.state).toBe('QUARANTINED');
    expect(await prisma.assetTagBinding.count({ where: { tagId } })).toBe(0);
  });

  it('re-commission + matching verify creates the binding', async () => {
    const rc = await request(app).post('/api/v1/tags/commission').set(auth())
      .send({ assetId, tidHex: TID_HEX });
    expect(rc.status).toBe(200);
    const r = await request(app).post(`/api/v1/tags/${tagId}/verify`).set(auth())
      .send({ assetId, readEpcHex: TID_HEX, readTidHex: TID_HEX, peakRssiDbm: -31 });
    expect(r.status).toBe(200);
    expect(r.body.verified).toBe(true);
    expect(r.body.bindingId).toBeTruthy();
  });

  it('permalock is blocked in INTERNAL mode without opt-in', async () => {
    const r = await request(app).post(`/api/v1/tags/${tagId}/permalock`).set(auth());
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('PERMALOCK_BLOCKED');
  });

  it('resolves the asset by EPC', async () => {
    const r = await request(app).get(`/api/v1/assets/by-epc/${TID_HEX}`).set(auth());
    expect(r.status).toBe(200);
    expect(r.body.kind).toBe('ASSET');
    expect(r.body.asset.id).toBe(assetId);
  });
});

describe('GS1 prefix lifecycle', () => {
  it('registers a prefix with a preview', async () => {
    const r = await request(app).post('/api/v1/identification/prefixes').set(auth())
      .send({ prefix: PREFIX, gs1MemberOrg: 'GS1 UAE' });
    expect(r.status).toBe(201);
    prefixId = r.body.id;
    expect(r.body.status).toBe('PENDING');
    expect(r.body.preview.sampleGiai).toBe('9521141100000123454');
    expect(r.body.preview.sampleEpcHex).toBe('3416451FD40000174878CA3E');
    expect(r.body.preview.partition).toBe(5);
  });

  it('refuses the same prefix for another tenant', async () => {
    await prisma.tenantIdentification.upsert({
      where: { tenantId: TID_B },
      update: {},
      create: { tenantId: TID_B, slug: 'gs1-other-tenant' },
    });
    await expect(
      prisma.tenantGs1Prefix.create({
        data: { tenantId: TID_B, prefix: PREFIX, gs1MemberOrg: 'GS1 UAE', createdBy: 'x' },
      }),
    ).rejects.toThrow();
  });

  it('refuses activation with a wrong asset count', async () => {
    const r = await request(app).post(`/api/v1/identification/prefixes/${prefixId}/activate`)
      .set(auth()).send({ confirmAssetCount: 99999 });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('ASSET_COUNT_MISMATCH');
  });

  it('activates and derives GIAIs for every identified asset', async () => {
    const count = await prisma.asset.count({
      where: { tenantId: TID, individualAssetReference: { not: null }, deletedAt: null },
    });
    const r = await request(app).post(`/api/v1/identification/prefixes/${prefixId}/activate`)
      .set(auth()).send({ confirmAssetCount: count });
    expect(r.status).toBe(200);
    expect(r.body.mode).toBe('GS1');
    expect(r.body.assetsUpdated).toBe(count);

    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    expect(asset!.giai).toBe(PREFIX + asset!.individualAssetReference);

    const ident = await request(app).get('/api/v1/identification').set(auth());
    expect(ident.body.mode).toBe('GS1');
    expect(ident.body.activePrefix.prefix).toBe(PREFIX);
  });

  it('encodes a GIAI-96 EPC in GS1 mode', async () => {
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    const r = await request(app).post('/api/v1/identifiers/encode').set(auth())
      .send({ individualAssetReference: asset!.individualAssetReference });
    expect(r.status).toBe(200);
    expect(r.body.mode).toBe('GS1');
    expect(r.body.scheme).toBe('GIAI96');
    expect(r.body.epcHex).toMatch(/^34[0-9A-F]{22}$/);
    expect(r.body.giai).toBe(asset!.giai);
    expect(r.body.digitalLink).toContain(`/8004/${asset!.giai}`);
    expect(r.body.canonicalDigitalLink).toBe(`https://id.gs1.org/8004/${asset!.giai}`);
  });
});

describe('Labels', () => {
  it('records a print with the Digital Link payload and verifies the scan', async () => {
    const r = await request(app).post('/api/v1/labels/print').set(auth())
      .send({ assetIds: [assetId], templateCode: 'FFE-STD-50x25' });
    expect(r.status).toBe(200);
    const print = r.body.prints[0];
    expect(print.payload).toContain('/8004/');
    expect(print.hri).toMatch(/^ACME [12] \d{5} \d{5} \d$/);

    const bad = await request(app).post(`/api/v1/labels/${print.printId}/scan-verified`)
      .set(auth()).send({ scannedPayload: 'https://wrong.example/x' });
    expect(bad.status).toBe(409);

    const ok = await request(app).post(`/api/v1/labels/${print.printId}/scan-verified`)
      .set(auth()).send({ scannedPayload: print.payload });
    expect(ok.status).toBe(200);
    expect(ok.body.scanVerified).toBe(true);
  });
});

describe('Event log', () => {
  it('chains events per asset and exposes them on the GS1 bundle', async () => {
    const r = await request(app).get(`/api/v1/assets/${assetId}/gs1`).set(auth());
    expect(r.status).toBe(200);
    expect(r.body.encoding.scheme).toBe('GIAI96');
    const types = r.body.events.map((e: { eventType: string }) => e.eventType);
    expect(types).toContain('CREATED');
    expect(types).toContain('TAG_COMMISSIONED');
    expect(types).toContain('TAG_VERIFIED');
    const seqs = r.body.events.map((e: { seq: number }) => e.seq).sort((a: number, b: number) => a - b);
    expect(seqs).toEqual(Array.from({ length: seqs.length }, (_, i) => i + 1));
  });
});
