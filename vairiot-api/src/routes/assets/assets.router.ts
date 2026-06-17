import { Router, Request, Response } from 'express';
import { body, query, validationResult } from 'express-validator';
import { authenticate } from '../../middleware/authenticate';
import { listAssets, getAsset, createAsset, updateAsset, deleteAsset, getAssetByTag } from '../../services/asset.service';

export const assetsRouter = Router();
assetsRouter.use(authenticate);

// GET /api/v1/assets?search=&categoryId=&siteId=&status=&page=&pageSize=
assetsRouter.get('/',
  [query('page').optional().isInt({ min: 1 }), query('pageSize').optional().isInt({ min: 1, max: 200 })],
  async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(await listAssets(req.user!.tenantId, {
        search:     req.query.search as string,
        categoryId: req.query.categoryId as string,
        siteId:     req.query.siteId as string,
        status:     req.query.status as string,
        page:       Number(req.query.page) || 1,
        pageSize:   Number(req.query.pageSize) || 50,
      }));
    } catch { res.status(500).json({ error: 'Failed to fetch assets' }); }
  },
);

// GET /api/v1/assets/tag/:tag — scan-to-lookup (barcode or RFID)
assetsRouter.get('/tag/:tag', async (req: Request, res: Response): Promise<void> => {
  try { res.json(await getAssetByTag(req.user!.tenantId, req.params.tag)); }
  catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') { res.status(404).json({ error: 'No asset found for this tag' }); return; }
    res.status(500).json({ error: 'Tag lookup failed' });
  }
});

// GET /api/v1/assets/:id
assetsRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try { res.json(await getAsset(req.user!.tenantId, req.params.id)); }
  catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') { res.status(404).json({ error: 'Asset not found' }); return; }
    res.status(500).json({ error: 'Failed to fetch asset' });
  }
});

// POST /api/v1/assets
assetsRouter.post('/',
  [body('name').notEmpty().withMessage('Asset name required')],
  async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    try { res.status(201).json(await createAsset(req.user!.tenantId, req.user!.sub, req.body)); }
    catch { res.status(500).json({ error: 'Failed to create asset' }); }
  },
);

// PATCH /api/v1/assets/:id
assetsRouter.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try { res.json(await updateAsset(req.user!.tenantId, req.params.id, req.user!.sub, req.body)); }
  catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') { res.status(404).json({ error: 'Asset not found' }); return; }
    res.status(500).json({ error: 'Failed to update asset' });
  }
});

// DELETE /api/v1/assets/:id
assetsRouter.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try { await deleteAsset(req.user!.tenantId, req.params.id, req.user!.sub); res.status(204).send(); }
  catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') { res.status(404).json({ error: 'Asset not found' }); return; }
    res.status(500).json({ error: 'Failed to delete asset' });
  }
});
