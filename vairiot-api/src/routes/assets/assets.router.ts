import { Router, Request, Response } from 'express';
import { body, query, validationResult } from 'express-validator';
import { authenticate, requirePermission } from '../../middleware/authenticate';
import { listAssets, getAsset, createAsset, updateAsset, deleteAsset, disposeAsset, getAssetByTag, listAssetsForExport, getAssetStats } from '../../services/asset.service';
import { toCsv } from '../../lib/csv';

export const assetsRouter = Router();
assetsRouter.use(authenticate);

// GET /api/v1/assets?search=&categoryId=&siteId=&status=&condition=&sortBy=&sortOrder=&page=&pageSize=
assetsRouter.get('/',
  [query('page').optional().isInt({ min: 1 }), query('pageSize').optional().isInt({ min: 1, max: 200 })],
  async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(await listAssets(req.user!.tenantId, {
        search:     req.query.search as string,
        categoryId: req.query.categoryId as string,
        siteId:     req.query.siteId as string,
        status:     req.query.status as string,
        condition:  req.query.condition as string,
        sortBy:     req.query.sortBy as string,
        sortOrder:  req.query.sortOrder as string,
        page:       Number(req.query.page) || 1,
        pageSize:   Number(req.query.pageSize) || 50,
        includeDeleted: req.query.includeDeleted === 'true',
      }));
    } catch { res.status(500).json({ error: 'Failed to fetch assets' }); }
  },
);

// GET /api/v1/assets/export.csv — asset register download (respects current filters)
assetsRouter.get('/export.csv', async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = await listAssetsForExport(req.user!.tenantId, {
      search:     req.query.search as string,
      categoryId: req.query.categoryId as string,
      siteId:     req.query.siteId as string,
      status:     req.query.status as string,
      condition:  req.query.condition as string,
    });
    const fmtDate = (d: Date | null | undefined) => d ? d.toISOString().slice(0, 10) : '';
    const fmtDec = (d: any) => d ? d.toString() : '';
    const flat = rows.map((a: any) => ({
      assetNumber: a.assetNumber, name: a.name, status: a.status, condition: a.condition,
      category: a.category?.name ?? '', site: a.site?.name ?? '', location: a.location?.name ?? '',
      serialNumber: a.serialNumber ?? '', modelNumber: a.modelNumber ?? '', manufacturer: a.manufacturer ?? '',
      barcode: a.barcode ?? '', rfidTag: a.rfidTag ?? '',
      purchaseDate: fmtDate(a.purchaseDate), purchaseCost: fmtDec(a.purchaseCost),
      purchaseOrderNumber: a.purchaseOrderNumber ?? '', invoiceNumber: a.invoiceNumber ?? '',
      invoiceDate: fmtDate(a.invoiceDate), receiptDate: fmtDate(a.receiptDate),
      capitalizationDate: fmtDate(a.capitalizationDate),
      freightCost: fmtDec(a.freightCost), installationCost: fmtDec(a.installationCost),
      customsDuties: fmtDec(a.customsDuties), otherCapitalizedCosts: fmtDec(a.otherCapitalizedCosts),
      capitalizedCost: a.depreciation?.capitalizedCost?.toString() ?? '',
      residualValue: fmtDec(a.residualValue), usefulLifeMonths: a.usefulLifeMonths?.toString() ?? '',
      depreciationMethod: a.depreciationMethod ?? '',
      monthlyDepreciation: a.depreciation?.monthlyDepreciation?.toString() ?? '',
      accumulatedDepreciation: a.depreciation?.accumulatedDepreciation?.toString() ?? '',
      netBookValue: a.depreciation?.netBookValue?.toString() ?? '',
      warrantyExpiry: fmtDate(a.warrantyExpiry), supplier: a.supplier ?? '', notes: a.notes ?? '',
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
      { key: 'purchaseOrderNumber', header: 'PO Number' },
      { key: 'invoiceNumber',  header: 'Invoice Number' },
      { key: 'invoiceDate',    header: 'Invoice Date' },
      { key: 'receiptDate',    header: 'Receipt Date' },
      { key: 'capitalizationDate', header: 'Capitalization Date' },
      { key: 'freightCost',    header: 'Freight Cost' },
      { key: 'installationCost', header: 'Installation Cost' },
      { key: 'customsDuties',  header: 'Customs Duties' },
      { key: 'otherCapitalizedCosts', header: 'Other Capitalized Costs' },
      { key: 'capitalizedCost', header: 'Capitalized Cost' },
      { key: 'residualValue',  header: 'Residual Value' },
      { key: 'depreciationMethod', header: 'Depreciation Method' },
      { key: 'usefulLifeMonths', header: 'Useful Life (Months)' },
      { key: 'monthlyDepreciation', header: 'Monthly Depreciation' },
      { key: 'accumulatedDepreciation', header: 'Accumulated Depreciation' },
      { key: 'netBookValue',   header: 'Net Book Value' },
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

// GET /api/v1/assets/stats — counts grouped by status / condition (dashboard)
assetsRouter.get('/stats', async (req: Request, res: Response): Promise<void> => {
  try { res.json(await getAssetStats(req.user!.tenantId)); }
  catch { res.status(500).json({ error: 'Failed to fetch asset stats' }); }
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
assetsRouter.post('/', requirePermission('asset:write'),
  [body('name').notEmpty().withMessage('Asset name required')],
  async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    try { res.status(201).json(await createAsset(req.user!.tenantId, req.user!.sub, req.body)); }
    catch { res.status(500).json({ error: 'Failed to create asset' }); }
  },
);

// PATCH /api/v1/assets/:id
assetsRouter.patch('/:id', requirePermission('asset:write'), async (req: Request, res: Response): Promise<void> => {
  try { res.json(await updateAsset(req.user!.tenantId, req.params.id, req.user!.sub, req.body)); }
  catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') { res.status(404).json({ error: 'Asset not found' }); return; }
    res.status(500).json({ error: 'Failed to update asset' });
  }
});

// DELETE /api/v1/assets/:id  (soft delete / archive)
assetsRouter.delete('/:id', requirePermission('asset:delete'), async (req: Request, res: Response): Promise<void> => {
  try { await deleteAsset(req.user!.tenantId, req.params.id, req.user!.sub); res.status(204).send(); }
  catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') { res.status(404).json({ error: 'Asset not found' }); return; }
    res.status(500).json({ error: 'Failed to archive asset' });
  }
});

// POST /api/v1/assets/:id/dispose — formal disposal with financial record
assetsRouter.post('/:id/dispose', requirePermission('asset:write'),
  [
    body('disposalDate').notEmpty().withMessage('Disposal date is required'),
    body('disposalMethod').notEmpty().withMessage('Disposal method is required'),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    try { res.json(await disposeAsset(req.user!.tenantId, req.params.id, req.user!.sub, req.body)); }
    catch (e) {
      if (e instanceof Error && e.message === 'NOT_FOUND') { res.status(404).json({ error: 'Asset not found' }); return; }
      if (e instanceof Error && e.message === 'ALREADY_DISPOSED') { res.status(409).json({ error: 'Asset is already disposed' }); return; }
      res.status(500).json({ error: 'Failed to dispose asset' });
    }
  },
);
