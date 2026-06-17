import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate } from '../../middleware/authenticate';
import { listCampaigns, createCampaign, startCampaign, recordScan, completeCampaign, getCampaignReport } from '../../services/audit.service';

export const auditsRouter = Router();
auditsRouter.use(authenticate);

auditsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try { res.json(await listCampaigns(req.user!.tenantId)); }
  catch { res.status(500).json({ error: 'Failed to fetch campaigns' }); }
});

auditsRouter.post('/',
  [body('name').notEmpty()],
  async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    try { res.status(201).json(await createCampaign(req.user!.tenantId, req.user!.sub, req.body)); }
    catch { res.status(500).json({ error: 'Failed to create campaign' }); }
  },
);

auditsRouter.post('/:id/start', async (req: Request, res: Response): Promise<void> => {
  try { res.json(await startCampaign(req.user!.tenantId, req.params.id)); }
  catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND')       { res.status(404).json({ error: 'Campaign not found' }); return; }
    if (e instanceof Error && e.message === 'ALREADY_STARTED') { res.status(409).json({ error: 'Campaign already started' }); return; }
    res.status(500).json({ error: 'Failed to start campaign' });
  }
});

auditsRouter.post('/:id/scans',
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

auditsRouter.post('/:id/complete', async (req: Request, res: Response): Promise<void> => {
  try { res.json(await completeCampaign(req.user!.tenantId, req.params.id)); }
  catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND')           { res.status(404).json({ error: 'Campaign not found' }); return; }
    if (e instanceof Error && e.message === 'CAMPAIGN_NOT_ACTIVE') { res.status(409).json({ error: 'Campaign is not in progress' }); return; }
    res.status(500).json({ error: 'Failed to complete campaign' });
  }
});

auditsRouter.get('/:id/report', async (req: Request, res: Response): Promise<void> => {
  try { res.json(await getCampaignReport(req.user!.tenantId, req.params.id)); }
  catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') { res.status(404).json({ error: 'Campaign not found' }); return; }
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});
