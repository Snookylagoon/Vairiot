import cors from 'cors';
import express, { Application, NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { authRouter }       from './routes/auth/auth.router';
import { healthRouter }     from './routes/health/health.router';
import { assetsRouter }     from './routes/assets/assets.router';
import { categoriesRouter } from './routes/categories/categories.router';
import { sitesRouter }      from './routes/sites/sites.router';
import { logger } from './lib/logger';

export function createApp(): Application {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.http(msg.trim()) },
    skip: () => process.env.NODE_ENV === 'test',
  }));
  app.use('/health',              healthRouter);
  app.use('/api/v1/auth',         authRouter);
  app.use('/api/v1/assets',       assetsRouter);
  app.use('/api/v1/categories',   categoriesRouter);
  app.use('/api/v1/sites',        sitesRouter);
  app.use((_req: Request, res: Response) => { res.status(404).json({ error: 'Not found' }); });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}
