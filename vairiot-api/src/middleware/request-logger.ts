import { NextFunction, Request, Response } from 'express';
import { logger } from '../lib/logger';
import { metrics } from '../lib/metrics';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    metrics.recordRequest(req.method, req.route?.path ?? req.path, status, duration);
    if (req.path === '/health' || req.path === '/health/ready') return;
    logger.info('request', {
      method: req.method,
      path: req.originalUrl,
      status,
      duration,
      requestId: req.requestId,
      tenantId: req.user?.tenantId,
      ip: req.ip,
    });
  });
  next();
}
