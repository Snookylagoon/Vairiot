import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import request from 'supertest';

import { createApp } from '../../app';
import { parseDeviceAttributes } from '../../lib/ios-enrolment';
import { prisma } from '../../lib/prisma';

// SEC-H2: the public enrolment callback must not trust what it is sent.
// A throwaway CA stands in for Apple's: payloads signed by a "device"
// certificate it issued must verify; anything else must be refused once a CA
// is configured.

const app = createApp();
const UDID_A = '00008110-001A2C3D4E5F6071';
const UDID_B = '00008110-00AAAAAAAAAAAAAA';
const UDID_REG = '00008110-00BBBBBBBBBBBBBB';
const ALL_UDIDS = [UDID_A, UDID_B, UDID_REG, '00008110-00CCCCCCCCCCCCCC'];

let dir: string;
let caFile: string;
const ssl = (...args: string[]) => execFileSync('openssl', args, { cwd: dir, stdio: 'pipe' });

function makeCa(name: string) {
  ssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${name}-ca.key`, '-out', `${name}-ca.pem`,
    '-days', '1', '-subj', `/CN=${name} Root`);
  ssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${name}-dev.key`, '-out', `${name}-dev.csr`, '-subj', '/CN=Device');
  ssl('x509', '-req', '-in', `${name}-dev.csr`, '-CA', `${name}-ca.pem`, '-CAkey', `${name}-ca.key`,
    '-CAcreateserial', '-out', `${name}-dev.pem`, '-days', '1');
}

function plist(udid: string, product = 'iPhone18,2') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>PRODUCT</key><string>${product}</string>
  <key>SERIAL</key><string>F2LXK0ABCD12</string>
  <key>UDID</key><string>${udid}</string>
  <key>VERSION</key><string>23A341</string>
</dict></plist>`;
}

/** A CMS-signed payload, as iOS sends it, signed by the named CA's device cert. */
function signed(xml: string, ca: string): Buffer {
  const name = `payload-${Math.random().toString(36).slice(2)}`;
  fs.writeFileSync(path.join(dir, `${name}.xml`), xml);
  ssl('cms', '-sign', '-in', `${name}.xml`, '-signer', `${ca}-dev.pem`, '-inkey', `${ca}-dev.key`,
    '-outform', 'DER', '-nodetach', '-binary', '-out', `${name}.p7s`);
  return fs.readFileSync(path.join(dir, `${name}.p7s`));
}

const enrol = (body: Buffer | string) =>
  request(app).post('/api/v1/ios/udid/callback').set('Content-Type', 'application/pkcs7-signature').send(Buffer.from(body));

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ios-enrol-'));
  makeCa('trusted');
  makeCa('rogue');
  caFile = path.join(dir, 'trusted-ca.pem');
});

afterEach(() => {
  delete process.env.IOS_UDID_CA_FILE;
});

afterAll(async () => {
  await prisma.iosDevice.deleteMany({ where: { udid: { in: ALL_UDIDS } } });
  fs.rmSync(dir, { recursive: true, force: true });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.iosDevice.deleteMany({ where: { udid: { in: ALL_UDIDS } } });
});

describe('without IOS_UDID_CA_FILE (verification not yet configured)', () => {
  it('accepts the enrolment but marks it unverified', async () => {
    const r = await enrol(plist(UDID_A));
    expect(r.status).toBe(301);
    const device = await prisma.iosDevice.findUniqueOrThrow({ where: { udid: UDID_A } });
    expect(device.signatureVerified).toBe(false);
    expect(device.product).toBe('iPhone18,2');
  });

  it('refuses a payload without a valid UDID', async () => {
    const r = await enrol(plist('not-a-udid'));
    expect(r.status).toBe(400);
    expect(await prisma.iosDevice.count({ where: { udid: 'not-a-udid' } })).toBe(0);
  });

  it('drops attributes that are not in Apple\'s format', async () => {
    await enrol(plist(UDID_A, '<script>x</script>'.replace(/[<>]/g, '')));
    const device = await prisma.iosDevice.findUniqueOrThrow({ where: { udid: UDID_A } });
    expect(device.product).toBeNull();
  });

  it('never lets an unverified payload rewrite a registered device', async () => {
    await prisma.iosDevice.create({ data: { udid: UDID_REG, product: 'iPhone17,1', registered: true } });
    const r = await enrol(plist(UDID_REG, 'iPad99,9'));
    expect(r.status).toBe(301);
    const device = await prisma.iosDevice.findUniqueOrThrow({ where: { udid: UDID_REG } });
    expect(device.product).toBe('iPhone17,1');
  });
});

describe('with IOS_UDID_CA_FILE set', () => {
  beforeEach(() => { process.env.IOS_UDID_CA_FILE = caFile; });

  it('accepts a payload signed by a certificate from the trusted CA', async () => {
    const r = await enrol(signed(plist(UDID_A), 'trusted'));
    expect(r.status).toBe(301);
    expect(r.headers.location).toContain(encodeURIComponent(UDID_A));
    const device = await prisma.iosDevice.findUniqueOrThrow({ where: { udid: UDID_A } });
    expect(device.signatureVerified).toBe(true);
    expect(device.serial).toBe('F2LXK0ABCD12');
  });

  it('refuses a payload signed by any other CA', async () => {
    const r = await enrol(signed(plist(UDID_B), 'rogue'));
    expect(r.status).toBe(400);
    expect(await prisma.iosDevice.count({ where: { udid: UDID_B } })).toBe(0);
  });

  it('refuses an unsigned payload', async () => {
    const r = await enrol(plist(UDID_B));
    expect(r.status).toBe(400);
    expect(await prisma.iosDevice.count({ where: { udid: UDID_B } })).toBe(0);
  });

  it('refuses a signed payload that was tampered with', async () => {
    const body = signed(plist(UDID_B), 'trusted');
    const tampered = Buffer.from(body.toString('latin1').replace('iPhone18,2', 'iPhone18,3'), 'latin1');
    const r = await enrol(tampered);
    expect(r.status).toBe(400);
  });

  it('a verified payload may update a registered device', async () => {
    await prisma.iosDevice.create({ data: { udid: UDID_REG, product: 'iPhone17,1', registered: true } });
    await enrol(signed(plist(UDID_REG), 'trusted'));
    const device = await prisma.iosDevice.findUniqueOrThrow({ where: { udid: UDID_REG } });
    expect(device.product).toBe('iPhone18,2');
    expect(device.signatureVerified).toBe(true);
    expect(device.registered).toBe(true);
  });
});

describe('parseDeviceAttributes', () => {
  it('accepts both Apple UDID formats', () => {
    expect(parseDeviceAttributes(plist('00008110-001A2C3D4E5F6071'))?.udid).toBe('00008110-001A2C3D4E5F6071');
    expect(parseDeviceAttributes(plist('a'.repeat(40)))?.udid).toBe('a'.repeat(40));
  });
  it('rejects anything else', () => {
    expect(parseDeviceAttributes(plist('1234'))).toBeNull();
    expect(parseDeviceAttributes('<plist></plist>')).toBeNull();
  });
});
