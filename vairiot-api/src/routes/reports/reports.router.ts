import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/authenticate';
import {
  depreciationRegister, fixedAssetRegister, disposalReport,
  assetAgingReport, maintenanceCostReport,
} from '../../services/report.service';

export const reportsRouter = Router();
reportsRouter.use(authenticate);

reportsRouter.get('/depreciation', async (req: Request, res: Response): Promise<void> => {
  try {
    const { categoryId, siteId, status } = req.query as Record<string, string>;
    res.json(await depreciationRegister(req.user!.tenantId, { categoryId, siteId, status }));
  } catch { res.status(500).json({ error: 'Failed to generate depreciation register' }); }
});

reportsRouter.get('/fixed-assets', async (req: Request, res: Response): Promise<void> => {
  try {
    const { categoryId, siteId, status } = req.query as Record<string, string>;
    res.json(await fixedAssetRegister(req.user!.tenantId, { categoryId, siteId, status }));
  } catch { res.status(500).json({ error: 'Failed to generate fixed asset register' }); }
});

reportsRouter.get('/disposals', async (req: Request, res: Response): Promise<void> => {
  try {
    const { from, to } = req.query as Record<string, string>;
    res.json(await disposalReport(req.user!.tenantId, { from, to }));
  } catch { res.status(500).json({ error: 'Failed to generate disposal report' }); }
});

reportsRouter.get('/aging', async (req: Request, res: Response): Promise<void> => {
  try {
    const { categoryId, siteId, status } = req.query as Record<string, string>;
    res.json(await assetAgingReport(req.user!.tenantId, { categoryId, siteId, status }));
  } catch { res.status(500).json({ error: 'Failed to generate aging report' }); }
});

reportsRouter.get('/maintenance-costs', async (req: Request, res: Response): Promise<void> => {
  try {
    const { from, to, assetId } = req.query as Record<string, string>;
    res.json(await maintenanceCostReport(req.user!.tenantId, { from, to, assetId }));
  } catch { res.status(500).json({ error: 'Failed to generate maintenance cost report' }); }
});
