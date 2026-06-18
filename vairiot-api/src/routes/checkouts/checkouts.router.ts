import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, requirePermission } from '../../middleware/authenticate';
import { checkoutAsset, checkinAsset, getCheckoutHistory, listActiveCheckouts, getOverdueCheckouts } from '../../services/checkout.service';

export const checkoutsRouter = Router();
checkoutsRouter.use(authenticate);

checkoutsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try { res.json(await listActiveCheckouts(req.user!.tenantId)); }
  catch { res.status(500).json({ error: 'Failed to fetch checkouts' }); }
});

checkoutsRouter.get('/overdue', async (req: Request, res: Response): Promise<void> => {
  try { res.json(await getOverdueCheckouts(req.user!.tenantId)); }
  catch { res.status(500).json({ error: 'Failed to fetch overdue checkouts' }); }
});

checkoutsRouter.post('/', requirePermission('asset:write'),
  [body('assetId').notEmpty(), body('custodianId').notEmpty()],
  async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    try { res.status(201).json(await checkoutAsset(req.user!.tenantId, req.user!.sub, req.body)); }
    catch (e) {
      if (e instanceof Error && e.message === 'ASSET_NOT_FOUND')     { res.status(404).json({ error: 'Asset not found' }); return; }
      if (e instanceof Error && e.message === 'ALREADY_CHECKED_OUT') { res.status(409).json({ error: 'Asset is already checked out' }); return; }
      res.status(500).json({ error: 'Failed to check out asset' });
    }
  },
);

checkoutsRouter.post('/:assetId/checkin', requirePermission('asset:write'), async (req: Request, res: Response): Promise<void> => {
  try { res.json(await checkinAsset(req.user!.tenantId, req.user!.sub, req.params.assetId)); }
  catch (e) {
    if (e instanceof Error && e.message === 'NOT_CHECKED_OUT') { res.status(409).json({ error: 'Asset is not currently checked out' }); return; }
    res.status(500).json({ error: 'Failed to check in asset' });
  }
});

checkoutsRouter.get('/:assetId/history', async (req: Request, res: Response): Promise<void> => {
  try { res.json(await getCheckoutHistory(req.user!.tenantId, req.params.assetId)); }
  catch (e) {
    if (e instanceof Error && e.message === 'ASSET_NOT_FOUND') { res.status(404).json({ error: 'Asset not found' }); return; }
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});
