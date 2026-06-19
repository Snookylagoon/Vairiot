import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

declare global { namespace Express { interface Request { requestId?: string; } } }

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers['x-request-id'] as string) || randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}
