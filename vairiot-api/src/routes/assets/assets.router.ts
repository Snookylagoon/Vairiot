import { Router, Request, Response } from 'express';
import { body, query, validationResult } from 'express-validator';
import { requireAnyPermission } from '../../middleware/authorise';
import { asyncHandler } from '../../middleware/error-handler';
import { enforceAssetCap } from '../../services/licence.service';
import { listAssets, getAsset, createAsset, updateAsset, deleteAsset, disposeAsset, getAssetByTag, listAssetsForExport, getAssetStats } from '../../services/asset.service';
import { bulkImportAssets } from '../../services/import.service';
import { toCsv } from '../../lib/csv';

export const assetsRouter = Router();

assetsRouter.get('/',
  [query('page').optional().isInt({ min: 1 }), query('pageSize').optional().isInt({ min: 1, max: 200 })],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
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
  }),
);

assetsRouter.get('/export.csv', requireAnyPermission('asset:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
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
  }),
);

assetsRouter.post('/import', requireAnyPermission('asset:write'),
  [body('rows').isArray({ min: 1 }).withMessage('At least one row is required')],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    res.json(await bulkImportAssets(req.user!.tenantId, req.user!.sub, req.body.rows));
  }),
);

assetsRouter.get('/stats', requireAnyPermission('asset:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await getAssetStats(req.user!.tenantId));
  }),
);

assetsRouter.get('/tag/:tag',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await getAssetByTag(req.user!.tenantId, req.params.tag));
  }),
);

assetsRouter.get('/:id',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await getAsset(req.user!.tenantId, req.params.id));
  }),
);

assetsRouter.post('/', requireAnyPermission('asset:write'),
  [body('name').notEmpty().withMessage('Asset name required')],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    await enforceAssetCap(req.user!.tenantId);
    res.status(201).json(await createAsset(req.user!.tenantId, req.user!.sub, req.body));
  }),
);

assetsRouter.patch('/:id', requireAnyPermission('asset:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await updateAsset(req.user!.tenantId, req.params.id, req.user!.sub, req.body));
  }),
);

assetsRouter.delete('/:id', requireAnyPermission('asset:delete'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await deleteAsset(req.user!.tenantId, req.params.id, req.user!.sub);
    res.status(204).send();
  }),
);

assetsRouter.post('/:id/dispose', requireAnyPermission('asset:write'),
  [
    body('disposalDate').notEmpty().withMessage('Disposal date is required'),
    body('disposalMethod').notEmpty().withMessage('Disposal method is required'),
  ],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    res.json(await disposeAsset(req.user!.tenantId, req.params.id, req.user!.sub, req.body));
  }),
);
