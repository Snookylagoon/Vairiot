import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, requirePermission } from '../../middleware/authenticate';
import { listCampaigns, createCampaign, startCampaign, recordScan, completeCampaign, getCampaignReport, getCampaignReportRows } from '../../services/audit.service';
import { toCsv } from '../../lib/csv';
import { enqueueAuditComplete } from '../../lib/queue';
import { logger } from '../../lib/logger';

interface ReportRows {
  campaign: { id: string; name: string };
  scans: Array<{ result: string; tagValue: string; asset: { assetNumber: string; name: string; category?: { name: string } | null; site?: { name: string } | null; location?: { name: string } | null } | null; scannedAt: Date; deviceId: string | null }>;
  missing: Array<{ assetNumber: string; name: string; category?: { name: string } | null; site?: { name: string } | null; location?: { name: string } | null }>;
}
function buildReportCsv(rows: ReportRows): string {
  const scanRows = rows.scans.map(s => ({
    result: s.result, tagValue: s.tagValue,
    assetNumber: s.asset?.assetNumber ?? '', assetName: s.asset?.name ?? '',
    category: s.asset?.category?.name ?? '', site: s.asset?.site?.name ?? '', location: s.asset?.location?.name ?? '',
    scannedAt: s.scannedAt.toISOString(), deviceId: s.deviceId ?? '',
  }));
  const missingRows = rows.missing.map(a => ({
    result: 'missing', tagValue: '', assetNumber: a.assetNumber, assetName: a.name,
    category: a.category?.name ?? '', site: a.site?.name ?? '', location: a.location?.name ?? '',
    scannedAt: '', deviceId: '',
  }));
  return toCsv([...scanRows, ...missingRows], [
    { key: 'result', header: 'Result' }, { key: 'tagValue', header: 'Tag' },
    { key: 'assetNumber', header: 'Asset Number' }, { key: 'assetName', header: 'Asset Name' },
    { key: 'category', header: 'Category' }, { key: 'site', header: 'Site' }, { key: 'location', header: 'Location' },
    { key: 'scannedAt', header: 'Scanned At' }, { key: 'deviceId', header: 'Device' },
  ]);
}

export const auditsRouter = Router();
auditsRouter.use(authenticate);

auditsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try { res.json(await listCampaigns(req.user!.tenantId)); }
  catch { res.status(500).json({ error: 'Failed to fetch campaigns' }); }
});

auditsRouter.post('/', requirePermission('audit:write'),
  [body('name').notEmpty()],
  async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    try { res.status(201).json(await createCampaign(req.user!.tenantId, req.user!.sub, req.body)); }
    catch { res.status(500).json({ error: 'Failed to create campaign' }); }
  },
);

auditsRouter.post('/:id/start', requirePermission('audit:write'), async (req: Request, res: Response): Promise<void> => {
  try { res.json(await startCampaign(req.user!.tenantId, req.params.id)); }
  catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND')       { res.status(404).json({ error: 'Campaign not found' }); return; }
    if (e instanceof Error && e.message === 'ALREADY_STARTED') { res.status(409).json({ error: 'Campaign already started' }); return; }
    res.status(500).json({ error: 'Failed to start campaign' });
  }
});

auditsRouter.post('/:id/scans', requirePermission('audit:write'),
  [body('tagValue').notEmpty()],
  async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    try { res.status(201).json(await recordScan(req.user!.tenantId, req.params.id, req.user!.sub, req.body)); }
    catch (e) {
      if (e instanceof Error && e.message === 'NOT_FOUND')           { res.status(404).json({ error: 'Campaign not found' }); return; }
      if (e instanceof Error && e.message === 'CAMPAIGN_NOT_ACTIVE') { res.status(409).json({ error: 'Campaign is not in progress' }); return; }
      res.status(500).json({ error: 'Failed to record scan' });
    }
  },
);

auditsRouter.post('/:id/complete', requirePermission('audit:write'), async (req: Request, res: Response): Promise<void> => {
  try {
    const summary = await completeCampaign(req.user!.tenantId, req.params.id);
    // Fire-and-forget notification — never block the HTTP response on it.
    void (async () => {
      try {
        const rows = await getCampaignReportRows(req.user!.tenantId, req.params.id);
        await enqueueAuditComplete({
          tenantId:       req.user!.tenantId,
          campaignId:     rows.campaign.id,
          campaignName:   rows.campaign.name,
          recipientEmail: req.user!.email,
          summary: {
            totalExpected: summary.totalExpected,
            totalScanned:  summary.totalScanned,
            found:         summary.found,
            missingCount:  summary.missing.length,
            unknownCount:  summary.unknownTags.length,
          },
          csv:         buildReportCsv(rows),
          completedAt: new Date().toISOString(),
        });
      } catch (e) {
        logger.error(`Failed to enqueue audit-complete notification: ${(e as Error).message}`);
      }
    })();
    res.json(summary);
  }
  catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND')           { res.status(404).json({ error: 'Campaign not found' }); return; }
    if (e instanceof Error && e.message === 'CAMPAIGN_NOT_ACTIVE') { res.status(409).json({ error: 'Campaign is not in progress' }); return; }
    res.status(500).json({ error: 'Failed to complete campaign' });
  }
});

auditsRouter.get('/:id/export.csv', async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = await getCampaignReportRows(req.user!.tenantId, req.params.id);
    const safeName = rows.campaign.name.replace(/[^a-z0-9-]+/gi, '_').slice(0, 40);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-${safeName}-${rows.campaign.id.slice(0, 8)}.csv"`);
    res.send(buildReportCsv(rows));
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') { res.status(404).json({ error: 'Campaign not found' }); return; }
    res.status(500).json({ error: 'Failed to export report' });
  }
});

auditsRouter.get('/:id/report', async (req: Request, res: Response): Promise<void> => {
  try { res.json(await getCampaignReport(req.user!.tenantId, req.params.id)); }
  catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') { res.status(404).json({ error: 'Campaign not found' }); return; }
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});
