import request from 'supertest';

import { createApp } from '../../app';
import { signAccessToken } from '../../lib/jwt';
import { prisma } from '../../lib/prisma';
import { flushAuditEvents } from '../../services/audit-event.service';
import { fixedAssetRegister } from '../../services/report.service';
import { ensureTestLicence, removeTestLicence } from '../helpers/test-licence';

// Stage 2.4: the asset class where the rest of the system meets it — asset
// responses (read by the apps), the register report and the import's
// `classCode` column.

const app = createApp();
const TID = 'test-class-wiring';
const OFF = 'test-class-wiring-off';
let userId = '';
let classId = '';

const token = (tenantId = TID, sub = userId) => signAccessToken({
  sub, tenantId, email: 'wiring@wiring.test', roles: ['Company Admin'],
  permissions: ['asset:read', 'asset:write', 'accounting:read', 'accounting:write'],
});
const importRows = (rows: Record<string, string>[], tenantId = TID, sub = userId) =>
  request(app).post('/api/v1/assets/import').set('Authorization', `Bearer ${token(tenantId, sub)}`).send({ rows });

beforeAll(async () => {
  await prisma.tenant.upsert({ where: { id: TID }, update: { onboardingComplete: true, featureFlags: { ipsas: true } }, create: { id: TID, name: TID, onboardingComplete: true, featureFlags: { ipsas: true } } });
  await prisma.tenant.upsert({ where: { id: OFF }, update: { onboardingComplete: true, featureFlags: {} }, create: { id: OFF, name: OFF, onboardingComplete: true } });
  userId = (await prisma.user.upsert({ where: { tenantId_email: { tenantId: TID, email: 'wiring@wiring.test' } }, update: {}, create: { tenantId: TID, email: 'wiring@wiring.test', name: 'Wiring' } })).id;
  await prisma.user.upsert({ where: { tenantId_email: { tenantId: OFF, email: 'wiring@wiring.test' } }, update: {}, create: { id: `${userId}-off`, tenantId: OFF, email: 'wiring@wiring.test', name: 'Off' } });
  await ensureTestLicence(TID);
  await ensureTestLicence(OFF);
  classId = (await prisma.assetClass.create({ data: { tenantId: TID, code: 'SGN', name: 'Road signs', ipsasClass: 'INFRASTRUCTURE', capitalisationThreshold: 500, defaultUsefulLifeMonths: 84 } })).id;
});

afterAll(async () => {
  await flushAuditEvents();
  for (const id of [TID, OFF]) {
    await prisma.auditEvent.deleteMany({ where: { tenantId: id } });
    await prisma.asset.deleteMany({ where: { tenantId: id } });
    await prisma.assetClass.deleteMany({ where: { tenantId: id } });
    await removeTestLicence(id);
    await prisma.user.deleteMany({ where: { tenantId: id } });
    await prisma.tenant.deleteMany({ where: { id } });
  }
  await prisma.$disconnect();
});

describe('import classCode', () => {
  it('sets the class from its code, in any case, and applies its defaults', async () => {
    const r = await importRows([{ name: 'Imported sign', classCode: 'sgn', purchaseCost: '900' }]);
    expect(r.body).toMatchObject({ created: 1, skipped: 0 });
    const asset = await prisma.asset.findFirstOrThrow({ where: { tenantId: TID, name: 'Imported sign' } });
    expect(asset).toMatchObject({ assetClassId: classId, usefulLifeMonths: 84, recognitionStatus: 'RECOGNISED' });
  });

  it('skips a row with an unknown code and says why', async () => {
    const r = await importRows([{ name: 'Mystery', classCode: 'XYZ' }, { name: 'Fine sign', classCode: 'SGN', purchaseCost: '100' }]);
    expect(r.body.created).toBe(1);
    expect(r.body.errors).toEqual([{ row: 1, message: 'Unknown asset class code: XYZ' }]);
  });

  it('ignores the column with the IPSAS ledger off', async () => {
    const r = await importRows([{ name: 'Plain', classCode: 'XYZ' }], OFF, `${userId}-off`);
    expect(r.body).toMatchObject({ created: 1, skipped: 0 });
  });
});

describe('class on the asset and in the register', () => {
  it('comes with the asset, for the apps to show', async () => {
    const asset = await prisma.asset.findFirstOrThrow({ where: { tenantId: TID, name: 'Imported sign' } });
    const r = await request(app).get(`/api/v1/assets/${asset.id}`).set('Authorization', `Bearer ${token()}`);
    expect(r.body.assetClass).toEqual({ id: classId, code: 'SGN', name: 'Road signs' });
    expect(r.body.recognitionStatus).toBe('RECOGNISED');
  });

  it('shows class and recognition in the fixed asset register', async () => {
    const rows = await fixedAssetRegister(TID);
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(byName['Imported sign']).toMatchObject({ assetClass: 'SGN', recognition: 'Recognised' });
    expect(byName['Fine sign']).toMatchObject({ assetClass: 'SGN', recognition: 'Expensed', netBookValue: 0 });
  });
});
