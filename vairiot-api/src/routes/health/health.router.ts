import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
export const healthRouter = Router();
healthRouter.get('/', (_req: Request, res: Response): void => {
  res.status(200).json({ status: 'ok', service: 'vairiot-api', time: new Date().toISOString() });
});
healthRouter.get('/ready', async (_req: Request, res: Response): Promise<void> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'ready', database: 'connected', time: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'not ready', database: 'disconnected', time: new Date().toISOString() });
  }
});
