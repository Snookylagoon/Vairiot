import request from 'supertest';

import { createApp } from '../../app';
import { prisma } from '../../lib/prisma';
import { flushAuditEvents } from '../../services/audit-event.service';

const app = createApp();
const TID = 'test-tenant-apikey';

let activeToken = '';
let revokedToken = '';

beforeAll(async () => {
  await prisma.tenant.upsert({
    where: { id: TID }, update: { onboardingComplete: true },
    create: { id: TID, name: 'API Key Test Tenant', onboardingComplete: true },
  });

  // Issue a key directly through the service so we get the raw token back.
  const { createApiKey, revokeApiKey } = await import('../../services/api-key.service');
  const active  = await createApiKey(TID, 'apikey-test-suite', { name: 'Active key', scopes: ['asset:read'] });
  activeToken = active.token;
  const toRevoke = await createApiKey(TID, 'apikey-test-suite', { name: 'Revoked key' });
  revokedToken = toRevoke.token;
  await revokeApiKey(TID, 'apikey-test-suite', toRevoke.id);
});

afterAll(async () => {
  await flushAuditEvents(); // let in-flight audit writes land before deleting the tenant
  await prisma.apiKey.deleteMany({ where: { tenantId: TID } });
  // The api-key service records audit events, so this tenant can own rows in
  // audit_events even though these tests only consume keys. Without this the
  // tenant delete would violate audit_events_tenantId_fkey the moment a test
  // here creates or revokes a key.
  await prisma.auditEvent.deleteMany({ where: { tenantId: TID } });
  await prisma.tenant.deleteMany({ where: { id: TID } });
  await prisma.$disconnect();
});

describe('API-key Bearer auth', () => {
  it('accepts a valid key on a tenant-scoped endpoint', async () => {
    const r = await request(app).get('/api/v1/sites').set('Authorization', `Bearer ${activeToken}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it('rejects a revoked key', async () => {
    const r = await request(app).get('/api/v1/sites').set('Authorization', `Bearer ${revokedToken}`);
    expect(r.status).toBe(401);
  });

  it('rejects an unknown vai_ token', async () => {
    const r = await request(app).get('/api/v1/sites').set('Authorization', 'Bearer vai_deadbeefdeadbeef');
    expect(r.status).toBe(401);
  });
});
