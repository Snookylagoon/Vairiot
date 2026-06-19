import { Router, Request, Response } from 'express';
import { requireAnyPermission } from '../../middleware/authorise';
import { asyncHandler } from '../../middleware/error-handler';
import {
  depreciationRegister, fixedAssetRegister, disposalReport,
  assetAgingReport, maintenanceCostReport,
} from '../../services/report.service';

export const reportsRouter = Router();
reportsRouter.use(requireAnyPermission('asset:read'));

reportsRouter.get('/depreciation',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { categoryId, siteId, status } = req.query as Record<string, string>;
    res.json(await depreciationRegister(req.user!.tenantId, { categoryId, siteId, status }));
  }),
);

reportsRouter.get('/fixed-assets',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { categoryId, siteId, status } = req.query as Record<string, string>;
    res.json(await fixedAssetRegister(req.user!.tenantId, { categoryId, siteId, status }));
  }),
);

reportsRouter.get('/disposals',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { from, to } = req.query as Record<string, string>;
    res.json(await disposalReport(req.user!.tenantId, { from, to }));
  }),
);

reportsRouter.get('/aging',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { categoryId, siteId, status } = req.query as Record<string, string>;
    res.json(await assetAgingReport(req.user!.tenantId, { categoryId, siteId, status }));
  }),
);

reportsRouter.get('/maintenance-costs',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { from, to, assetId } = req.query as Record<string, string>;
    res.json(await maintenanceCostReport(req.user!.tenantId, { from, to, assetId }));
  }),
);
