import { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code });
    return;
  }
  logger.error('Unhandled error', { error: err.message, stack: err.stack, requestId: _req.requestId });
  res.status(500).json({ error: 'Internal server error' });
}

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export function asyncHandler(fn: AsyncHandler): AsyncHandler {
  return (req, res, next) => fn(req, res, next).catch(next);
}
