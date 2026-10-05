import bcrypt from 'bcryptjs';
import express from 'express';
import { RedisStore } from 'rate-limit-redis';
import request from 'supertest';

import { createApp } from '../../app';
import { prisma } from '../../lib/prisma';
import { getRedis } from '../../lib/redis';
import { createSyncLimiter } from '../../middleware/rate-limit';

// S0.4 acceptance: state that protects the API must hold across API replicas.
// Each createApp() below is a separate replica sharing only Postgres and Redis,
// exactly like two API containers behind nginx.

const TID = 'test-replica-tenant-001';
const EMAIL = 'replica@vairiot.test';
const PASS = 'TestPassword123!';
const replicaA = createApp();
const replicaB = createApp();

beforeAll(async () => {
  await prisma.tenant.upsert({ where: { id: TID }, update: { onboardingComplete: true }, create: { id: TID, name: 'Replica Test Tenant', onboardingComplete: true } });
  const hash = await bcrypt.hash(PASS, 4);
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: TID, email: EMAIL } },
    update: { passwordHash: hash, failedLoginCount: 0, lockedUntil: null },
    create: { tenantId: TID, email: EMAIL, name: 'Replica Tester', passwordHash: hash },
  });
});

afterAll(async () => {
  await prisma.loginAttempt.deleteMany({ where: { email: EMAIL } });
  await prisma.user.deleteMany({ where: { tenantId: TID } });
  await prisma.tenant.deleteMany({ where: { id: TID } });
  await prisma.$disconnect();
  await getRedis().quit();
});

describe('login lockout across replicas', () => {
  it('six failed logins spread over two replicas lock the account on both', async () => {
    const login = (replica: express.Application, password: string) =>
      request(replica).post('/api/v1/auth/login').send({ email: EMAIL, password, tenantId: TID });

    // Five failures alternating between replicas: neither replica saw five.
    for (let i = 0; i < 5; i++) {
      const r = await login(i % 2 === 0 ? replicaA : replicaB, 'wrong-password');
      expect(r.status).toBe(401);
    }
    // Sixth attempt, correct password, on either replica: locked.
    for (const replica of [replicaA, replicaB]) {
      const r = await login(replica, PASS);
      expect(r.status).toBe(401);
      expect(r.body.code).toBe('ACCOUNT_LOCKED');
    }
  });
});

describe('Redis-backed rate limits across replicas', () => {
  it('two replicas share one per-user sync budget', async () => {
    // Fresh key space so reruns start from zero.
    const prefix = `rl:test-sync-${Date.now()}:`;
    const replica = () => {
      const app = express();
      app.use((req, _res, next) => { req.user = { sub: 'scanner-1', tenantId: TID } as never; next(); });
      app.use(createSyncLimiter(3, new RedisStore({
        prefix,
        sendCommand: (command: string, ...args: string[]) => getRedis().call(command, ...args) as Promise<never>,
      })));
      app.post('/api/v1/audits/:id/scans', (_req, res) => { res.status(201).json({}); });
      return app;
    };
    const a = replica();
    const b = replica();
    const scan = (app: express.Application) => request(app).post('/api/v1/audits/c1/scans');

    expect((await scan(a)).status).toBe(201);
    expect((await scan(b)).status).toBe(201);
    expect((await scan(a)).status).toBe(201);
    // Fourth request in the window, on the other replica: over the shared limit.
    expect((await scan(b)).status).toBe(429);
  });
});
