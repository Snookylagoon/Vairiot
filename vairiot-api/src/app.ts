import cors from 'cors';
import express, { Application, NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { authRouter }       from './routes/auth/auth.router';
import { healthRouter }     from './routes/health/health.router';
import { assetsRouter }     from './routes/assets/assets.router';
import { categoriesRouter } from './routes/categories/categories.router';
import { sitesRouter }      from './routes/sites/sites.router';
import { auditsRouter }     from './routes/audits/audits.router';
import { checkoutsRouter }  from './routes/checkouts/checkouts.router';
import { photosRouter }     from './routes/photos/photos.router';
import { usersRouter }      from './routes/admin/users.router';
import { apiKeysRouter }    from './routes/admin/api-keys.router';
import { auditEventsRouter } from './routes/admin/audit-events.router';
import { documentsRouter }   from './routes/documents/documents.router';
import { maintenanceRouter }  from './routes/maintenance/maintenance.router';
import { transfersRouter }    from './routes/transfers/transfers.router';
import { exceptionsRouter }   from './routes/exceptions/exceptions.router';
import { reportsRouter }      from './routes/reports/reports.router';
import { timelineRouter }     from './routes/timeline/timeline.router';
import { alertsRouter }       from './routes/alerts/alerts.router';
import { webhooksRouter }     from './routes/webhooks/webhooks.router';
import { customFieldsRouter } from './routes/custom-fields/custom-fields.router';
import { logger } from './lib/logger';
import { globalLimiter } from './middleware/rate-limit';
import { errorHandler } from './middleware/error-handler';

export function createApp(): Application {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true }));
  app.use(globalLimiter);
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
  app.use('/api/v1/audits',       auditsRouter);
  app.use('/api/v1/checkouts',    checkoutsRouter);
  app.use('/api/v1',               photosRouter);   // /assets/:id/photos, /photos/:id/download, /photos/:id
  app.use('/api/v1/users',        usersRouter);
  app.use('/api/v1/api-keys',     apiKeysRouter);
  app.use('/api/v1/audit-events', auditEventsRouter);
  app.use('/api/v1',              documentsRouter);   // /assets/:id/documents, /documents/:id/download, /documents/:id
  app.use('/api/v1/maintenance',  maintenanceRouter);
  app.use('/api/v1/transfers',    transfersRouter);
  app.use('/api/v1/exceptions',   exceptionsRouter);
  app.use('/api/v1/reports',      reportsRouter);
  app.use('/api/v1/timeline',     timelineRouter);
  app.use('/api/v1/alerts',       alertsRouter);
  app.use('/api/v1/webhooks',     webhooksRouter);
  app.use('/api/v1/custom-fields', customFieldsRouter);
  app.use((_req: Request, res: Response) => { res.status(404).json({ error: 'Not found' }); });
  app.use(errorHandler);
  return app;
}
