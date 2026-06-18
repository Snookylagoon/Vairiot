import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, requireAnyPermission } from '../../middleware/authenticate';
import { asyncHandler } from '../../middleware/error-handler';
import { listSites, createSite, deleteSite, listLocations, createLocation } from '../../services/site.service';

export const sitesRouter = Router();
sitesRouter.use(authenticate);

sitesRouter.get('/',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await listSites(req.user!.tenantId));
  }),
);

sitesRouter.post('/', requireAnyPermission('site:write'),
  [body('name').notEmpty()],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    res.status(201).json(await createSite(req.user!.tenantId, req.body));
  }),
);

sitesRouter.delete('/:siteId', requireAnyPermission('site:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await deleteSite(req.params.siteId, req.user!.tenantId);
    res.json({ message: 'Site deleted' });
  }),
);

sitesRouter.get('/:siteId/locations',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await listLocations(req.params.siteId, req.user!.tenantId));
  }),
);

sitesRouter.post('/:siteId/locations', requireAnyPermission('site:write'),
  [body('name').notEmpty()],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    res.status(201).json(await createLocation(req.params.siteId, req.user!.tenantId, req.body));
  }),
);
