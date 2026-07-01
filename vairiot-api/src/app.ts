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
import { platformRouter } from './routes/admin/platform.router';
import { subTenantsRouter } from './routes/sub-tenants/sub-tenants.router';
import { mobileRouter } from './routes/mobile/mobile.router';
import { mobileReleasesRouter } from './routes/admin/mobile-releases.router';
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
  const allowedOrigins = (process.env.WEB_ORIGIN ?? 'http://localhost:3000,http://localhost:3002').split(',').map(o => o.trim());
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(globalLimiter);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestId);
  app.use(requestLogger);
  app.use((_req, res, next) => { res.setHeader('X-API-Version', '1.0.0'); next(); });
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, { customSiteTitle: 'Vairiot API Docs' }));
  app.get('/api/openapi.json', (_req, res) => { res.json(openApiSpec); });
  app.get('/', (_req, res) => { res.json({ name: 'Vairiot API', version: '1.0.0', docs: '/api/docs' }); });
  // ── Ungated routes (no onboarding requirement) ──
  app.use('/health',              healthRouter);
  app.use('/api/v1/health',       healthRouter);
  app.use('/api/v1/auth',         authRouter);

  // ── Public mobile auto-update endpoints (no auth — needed before login) ──
  app.use('/api/v1/mobile',        mobileRouter);

  // ── Public tenant logo (img tag can't send Authorization header) ──
  app.get('/api/v1/public/tenants/:id/logo', async (req, res) => {
    try {
      const { prisma } = await import('./lib/prisma');
      const { minioClient, PHOTO_BUCKET } = await import('./lib/minio');
      const { Readable } = await import('stream');
      const company = await prisma.company.findUnique({ where: { tenantId: req.params.id } });
      if (!company?.logoStorageKey) { res.status(404).json({ error: 'No logo' }); return; }
      const stream = await minioClient.getObject(PHOTO_BUCKET, company.logoStorageKey);
      const ext = company.logoStorageKey.split('.').pop();
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'public, max-age=300');
      (stream as InstanceType<typeof Readable>).pipe(res);
    } catch {
      res.status(404).json({ error: 'No logo' });
    }
  });

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
  gated.use('/company/sub-tenants', subTenantsRouter);
  gated.use('/admin/platform', platformRouter);
  gated.use('/admin/mobile-releases', mobileReleasesRouter);

  app.use('/api/v1', gated);
  app.use((_req: Request, res: Response) => { res.status(404).json({ error: 'Not found' }); });
  app.use(errorHandler);
  return app;
}
