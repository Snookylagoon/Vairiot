import cors from 'cors';
import express, { Application, NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { openApiSpec } from './lib/openapi';
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
import { licencesRouter }    from './routes/licences/licences.router';
import { onboardingRouter } from './routes/onboarding/onboarding.router';
import { twoFactorRouter } from './routes/two-factor/two-factor.router';
import { globalLimiter } from './middleware/rate-limit';
import { errorHandler } from './middleware/error-handler';
import { requestId } from './middleware/request-id';
import { requestLogger } from './middleware/request-logger';
import { authenticate } from './middleware/authenticate';
import { requireOnboardingComplete } from './middleware/onboarding-guard';

export function createApp(): Application {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true }));
  app.use(globalLimiter);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestId);
  app.use(requestLogger);
  app.use((_req, res, next) => { res.setHeader('X-API-Version', '1.0.0'); next(); });
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, { customSiteTitle: 'Vairiot API Docs' }));
  app.get('/api/openapi.json', (_req, res) => { res.json(openApiSpec); });
  // ── Ungated routes (no onboarding requirement) ──
  app.use('/health',              healthRouter);
  app.use('/api/v1/auth',         authRouter);

  // ── Auth-required but onboarding-exempt (needed DURING onboarding) ──
  app.use('/api/v1/onboarding',   authenticate, onboardingRouter);
  app.use('/api/v1/2fa',          authenticate, twoFactorRouter);

  // ── Gated routes: require authentication + completed onboarding ──
  const gated = express.Router();
  gated.use(authenticate);
  gated.use(requireOnboardingComplete());

  gated.use('/assets',       assetsRouter);
  gated.use('/categories',   categoriesRouter);
  gated.use('/sites',        sitesRouter);
  gated.use('/audits',       auditsRouter);
  gated.use('/checkouts',    checkoutsRouter);
  gated.use('/',             photosRouter);       // /assets/:id/photos, /photos/:id/download, /photos/:id
  gated.use('/users',        usersRouter);
  gated.use('/api-keys',     apiKeysRouter);
  gated.use('/audit-events', auditEventsRouter);
  gated.use('/',             documentsRouter);    // /assets/:id/documents, /documents/:id/download, /documents/:id
  gated.use('/maintenance',  maintenanceRouter);
  gated.use('/transfers',    transfersRouter);
  gated.use('/exceptions',   exceptionsRouter);
  gated.use('/reports',      reportsRouter);
  gated.use('/timeline',     timelineRouter);
  gated.use('/alerts',       alertsRouter);
  gated.use('/webhooks',     webhooksRouter);
  gated.use('/custom-fields', customFieldsRouter);
  gated.use('/licences',     licencesRouter);

  app.use('/api/v1', gated);
  app.use((_req: Request, res: Response) => { res.status(404).json({ error: 'Not found' }); });
  app.use(errorHandler);
  return app;
}
