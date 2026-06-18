import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, requirePermission } from '../../middleware/authenticate';
import { listSites, createSite, deleteSite, listLocations, createLocation } from '../../services/site.service';

export const sitesRouter = Router();
sitesRouter.use(authenticate);

sitesRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try { res.json(await listSites(req.user!.tenantId)); }
  catch { res.status(500).json({ error: 'Failed to fetch sites' }); }
});

sitesRouter.post('/', requirePermission('site:write'),
  [body('name').notEmpty()],
  async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    try { res.status(201).json(await createSite(req.user!.tenantId, req.body)); }
    catch { res.status(500).json({ error: 'Failed to create site' }); }
  },
);

sitesRouter.delete('/:siteId', requirePermission('site:write'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      await deleteSite(req.params.siteId, req.user!.tenantId);
      res.json({ message: 'Site deleted' });
    } catch (e) {
      if (e instanceof Error && e.message === 'NOT_FOUND') { res.status(404).json({ error: 'Site not found' }); return; }
      if (e instanceof Error && e.message === 'HAS_ASSETS') { res.status(409).json({ error: 'Cannot delete site with assigned assets' }); return; }
      res.status(500).json({ error: 'Failed to delete site' });
    }
  },
);

sitesRouter.get('/:siteId/locations', async (req: Request, res: Response): Promise<void> => {
  try { res.json(await listLocations(req.params.siteId, req.user!.tenantId)); }
  catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') { res.status(404).json({ error: 'Site not found' }); return; }
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

sitesRouter.post('/:siteId/locations', requirePermission('site:write'),
  [body('name').notEmpty()],
  async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    try { res.status(201).json(await createLocation(req.params.siteId, req.user!.tenantId, req.body)); }
    catch (e) {
      if (e instanceof Error && e.message === 'NOT_FOUND') { res.status(404).json({ error: 'Site not found' }); return; }
      res.status(500).json({ error: 'Failed to create location' });
    }
  },
);
