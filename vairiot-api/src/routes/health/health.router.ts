import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { getRedis } from '../../lib/redis';
import { metrics } from '../../lib/metrics';

export const healthRouter = Router();

healthRouter.get('/', (_req: Request, res: Response): void => {
  res.status(200).json({ status: 'ok', service: 'vairiot-api', time: new Date().toISOString() });
});

healthRouter.get('/ready', async (_req: Request, res: Response): Promise<void> => {
  const checks: Record<string, 'connected' | 'disconnected'> = {};
  let healthy = true;

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'connected';
  } catch {
    checks.database = 'disconnected';
    healthy = false;
  }

  try {
    await getRedis().ping();
    checks.redis = 'connected';
  } catch {
    checks.redis = 'disconnected';
  }

  const status = healthy ? 'ready' : 'not ready';
  res.status(healthy ? 200 : 503).json({ status, checks, time: new Date().toISOString() });
});

healthRouter.get('/metrics', (_req: Request, res: Response): void => {
  res.json(metrics.getSummary());
});
