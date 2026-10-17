import bcrypt from 'bcryptjs';
import request from 'supertest';

import { createApp } from '../../app';
import { DEFAULT_MAP_SETTINGS, DEFAULT_TILE_HOSTS, resolveMapSettings, tileHostAllowed } from '../../lib/map-settings';
import { prisma } from '../../lib/prisma';
import { flushAuditEvents } from '../../services/audit-event.service';
import { ensureTestLicence, removeTestLicence } from '../helpers/test-licence';

// Per-tenant base map (Phase 1 W4, stage 1.12).

// The operator allows TUDA's tile server in the console's CSP (G31, stage 2.16).
process.env.CSP_TILE_HOSTS = 'https://tile.openstreetmap.org https://tiles.tuda.example';
const app = createApp();
const TID = 'test-map-settings-tenant';
const PASS = 'TestPassword123!';
const tokens: Record<string, string> = {};
const VALID = {
  tileUrl: 'https://tiles.tuda.example/{z}/{x}/{y}.png',
  attribution: '© TUDA, © OpenStreetMap contributors',
  centreLatitude: 41.7151, centreLongitude: 44.8271, zoom: 12,
};

async function user(email: string, perms: string[], roleName: string) {
  const role = await prisma.role.upsert({ where: { tenantId_name: { tenantId: TID, name: roleName } }, update: { permissions: perms }, create: { tenantId: TID, name: roleName, permissions: perms } });
  const u = await prisma.user.upsert({ where: { tenantId_email: { tenantId: TID, email } }, update: {}, create: { tenantId: TID, email, name: roleName, passwordHash: await bcrypt.hash(PASS, 12) } });
  await prisma.userRole.upsert({ where: { userId_roleId: { userId: u.id, roleId: role.id } }, update: {}, create: { userId: u.id, roleId: role.id } });
  tokens[roleName] = (await request(app).post('/api/v1/auth/login').send({ email, password: PASS, tenantId: TID })).body.accessToken;
}
const as = (role: string) => ({ Authorization: `Bearer ${tokens[role]}` });

beforeAll(async () => {
  await prisma.tenant.upsert({ where: { id: TID }, update: { onboardingComplete: true, featureFlags: { gis: true }, mapSettings: {} }, create: { id: TID, name: 'Map Settings', onboardingComplete: true, featureFlags: { gis: true } } });
  await ensureTestLicence(TID);
  await user('mapadmin@vairiot.test', ['company:manage', 'asset:read'], 'Administrator');
  await user('mapviewer@vairiot.test', ['asset:read'], 'Viewer');
});

afterAll(async () => {
  await flushAuditEvents();
  await prisma.auditEvent.deleteMany({ where: { tenantId: TID } });
  await prisma.userRole.deleteMany({ where: { user: { tenantId: TID } } });
  await prisma.user.deleteMany({ where: { tenantId: TID } });
  await prisma.role.deleteMany({ where: { tenantId: TID } });
  await removeTestLicence(TID);
  await prisma.tenant.deleteMany({ where: { id: TID } });
  await prisma.$disconnect();
});

describe('GET /gis/map-settings', () => {
  it('gives the OpenStreetMap defaults until set', async () => {
    const r = await request(app).get('/api/v1/gis/map-settings').set(as('Viewer'));
    expect(r.status).toBe(200);
    expect(r.body).toEqual(DEFAULT_MAP_SETTINGS);
  });
});

describe('PUT /gis/map-settings', () => {
  it('saves valid settings, audits the change and serves them to everyone', async () => {
    const put = await request(app).put('/api/v1/gis/map-settings').set(as('Administrator')).send(VALID);
    expect(put.status).toBe(200);
    expect((await request(app).get('/api/v1/gis/map-settings').set(as('Viewer'))).body).toEqual(VALID);
    await flushAuditEvents();
    const audit = await prisma.auditEvent.findFirst({ where: { tenantId: TID, action: 'map_settings_updated' } });
    expect(audit?.after).toMatchObject({ zoom: 12 });
  });

  it('needs company:manage', async () => {
    expect((await request(app).put('/api/v1/gis/map-settings').set(as('Viewer')).send(VALID)).status).toBe(403);
  });

  it('refuses unsafe or malformed settings', async () => {
    const bad = [
      { ...VALID, tileUrl: 'http://tiles.example/{z}/{x}/{y}.png' },
      { ...VALID, tileUrl: 'https://tiles.example/tile.png' },
      { ...VALID, attribution: '<img src=x onerror=alert(1)>' },
      { ...VALID, centreLatitude: 95 },
      { ...VALID, zoom: 25 },
    ];
    for (const body of bad) {
      expect((await request(app).put('/api/v1/gis/map-settings').set(as('Administrator')).send(body)).status).toBe(400);
    }
  });

  it('is hidden while GIS is off', async () => {
    await prisma.tenant.update({ where: { id: TID }, data: { featureFlags: {} } });
    expect((await request(app).get('/api/v1/gis/map-settings').set(as('Viewer'))).status).toBe(404);
    await prisma.tenant.update({ where: { id: TID }, data: { featureFlags: { gis: true } } });
  });
});

describe('resolveMapSettings', () => {
  it('fills partial settings from the defaults and ignores bad stored values', () => {
    expect(resolveMapSettings({ zoom: 12 })).toEqual({ ...DEFAULT_MAP_SETTINGS, zoom: 12 });
    expect(resolveMapSettings({ attribution: '<b>x</b>' })).toEqual(DEFAULT_MAP_SETTINGS);
    expect(resolveMapSettings(null)).toEqual(DEFAULT_MAP_SETTINGS);
  });
});

describe('tile servers and the Content-Security-Policy (G31, stage 2.16)', () => {
  it('refuses to save a tile server the console may not load from', async () => {
    const r = await request(app).put('/api/v1/gis/map-settings').set(as('Administrator')).send({ ...VALID, tileUrl: 'https://tiles.elsewhere.example/{z}/{x}/{y}.png' });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/CSP_TILE_HOSTS/);
  });

  it('matches an origin exactly, or a subdomain under a *. entry', () => {
    expect(tileHostAllowed('https://tile.openstreetmap.org/{z}/{x}/{y}.png', DEFAULT_TILE_HOSTS)).toBe(true);
    expect(tileHostAllowed('https://a.tiles.gov.example/{z}/{x}/{y}.png', 'https://*.tiles.gov.example')).toBe(true);
    expect(tileHostAllowed('https://tiles.gov.example/{z}/{x}/{y}.png', 'https://*.tiles.gov.example')).toBe(false);
    expect(tileHostAllowed('https://tile.openstreetmap.org.evil.example/{z}/{x}/{y}.png', 'https://tile.openstreetmap.org')).toBe(false);
    expect(tileHostAllowed('https://tiles.tuda.example:8443/{z}/{x}/{y}.png', 'http://tiles.tuda.example')).toBe(false);
  });
});
