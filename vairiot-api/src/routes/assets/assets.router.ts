import { Router, Request, Response } from 'express';
import { body, query, validationResult } from 'express-validator';
import { authenticate } from '../../middleware/authenticate';
import { listAssets, getAsset, createAsset, updateAsset, deleteAsset, getAssetByTag, listAssetsForExport } from '../../services/asset.service';
import { toCsv } from '../../lib/csv';

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

// GET /api/v1/assets/export.csv — full asset register download
assetsRouter.get('/export.csv', async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = await listAssetsForExport(req.user!.tenantId);
    const flat = rows.map(a => ({
      assetNumber: a.assetNumber, name: a.name, status: a.status, condition: a.condition,
      category: a.category?.name ?? '', site: a.site?.name ?? '', location: a.location?.name ?? '',
      serialNumber: a.serialNumber ?? '', modelNumber: a.modelNumber ?? '', manufacturer: a.manufacturer ?? '',
      barcode: a.barcode ?? '', rfidTag: a.rfidTag ?? '',
      purchaseDate: a.purchaseDate ? a.purchaseDate.toISOString().slice(0, 10) : '',
      purchaseCost: a.purchaseCost ? a.purchaseCost.toString() : '',
      warrantyExpiry: a.warrantyExpiry ? a.warrantyExpiry.toISOString().slice(0, 10) : '',
      supplier: a.supplier ?? '', notes: a.notes ?? '',
      createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString(),
    }));
    const csv = toCsv(flat, [
      { key: 'assetNumber',    header: 'Asset Number' },
      { key: 'name',           header: 'Name' },
      { key: 'status',         header: 'Status' },
      { key: 'condition',      header: 'Condition' },
      { key: 'category',       header: 'Category' },
      { key: 'site',           header: 'Site' },
      { key: 'location',       header: 'Location' },
      { key: 'serialNumber',   header: 'Serial Number' },
      { key: 'modelNumber',    header: 'Model Number' },
      { key: 'manufacturer',   header: 'Manufacturer' },
      { key: 'barcode',        header: 'Barcode' },
      { key: 'rfidTag',        header: 'RFID Tag' },
      { key: 'purchaseDate',   header: 'Purchase Date' },
      { key: 'purchaseCost',   header: 'Purchase Cost' },
      { key: 'warrantyExpiry', header: 'Warranty Expiry' },
      { key: 'supplier',       header: 'Supplier' },
      { key: 'notes',          header: 'Notes' },
      { key: 'createdAt',      header: 'Created' },
      { key: 'updatedAt',      header: 'Updated' },
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="assets-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(csv);
  } catch { res.status(500).json({ error: 'Failed to export assets' }); }
});

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
