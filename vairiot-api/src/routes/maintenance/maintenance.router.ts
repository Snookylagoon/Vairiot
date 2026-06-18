import { Router, Request, Response } from 'express';
import { body, query, validationResult } from 'express-validator';
import { authenticate, requirePermission } from '../../middleware/authenticate';
import {
  listMaintenanceEvents, getMaintenanceEvent, createMaintenanceEvent,
  updateMaintenanceEvent, deleteMaintenanceEvent,
} from '../../services/maintenance.service';

export const maintenanceRouter = Router();
maintenanceRouter.use(authenticate);

maintenanceRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { assetId, status, page, pageSize } = req.query as Record<string, string>;
    res.json(await listMaintenanceEvents(req.user!.tenantId, {
      assetId, status,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    }));
  } catch { res.status(500).json({ error: 'Failed to list maintenance events' }); }
});

maintenanceRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const evt = await getMaintenanceEvent(req.user!.tenantId, req.params.id);
    if (!evt) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(evt);
  } catch { res.status(500).json({ error: 'Failed to get maintenance event' }); }
});

maintenanceRouter.post(
  '/',
  requirePermission('asset:write'),
  [
    body('assetId').isString().notEmpty(),
    body('maintenanceType').isString().notEmpty(),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    try {
      const evt = await createMaintenanceEvent(req.user!.tenantId, req.user!.sub, req.body);
      res.status(201).json(evt);
    } catch (e) {
      if (e instanceof Error && e.message === 'ASSET_NOT_FOUND') { res.status(404).json({ error: 'Asset not found' }); return; }
      res.status(500).json({ error: 'Failed to create maintenance event' });
    }
  },
);

maintenanceRouter.patch(
  '/:id',
  requirePermission('asset:write'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const evt = await updateMaintenanceEvent(req.user!.tenantId, req.params.id, req.body);
      res.json(evt);
    } catch (e) {
      if (e instanceof Error && e.message === 'NOT_FOUND') { res.status(404).json({ error: 'Not found' }); return; }
      res.status(500).json({ error: 'Failed to update maintenance event' });
    }
  },
);

maintenanceRouter.delete('/:id', requirePermission('asset:delete'), async (req: Request, res: Response): Promise<void> => {
  try { res.json(await deleteMaintenanceEvent(req.user!.tenantId, req.params.id)); }
  catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') { res.status(404).json({ error: 'Not found' }); return; }
    res.status(500).json({ error: 'Failed to delete maintenance event' });
  }
});
