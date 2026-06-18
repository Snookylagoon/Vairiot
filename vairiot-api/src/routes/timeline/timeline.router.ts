import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { getAssetTimeline } from '../../services/timeline.service';

export const timelineRouter = Router();
timelineRouter.use(authenticate);

timelineRouter.get('/:assetId', async (req: Request, res: Response): Promise<void> => {
  try {
    const entries = await getAssetTimeline(req.user!.tenantId, req.params.assetId);
    res.json(entries);
  } catch { res.status(500).json({ error: 'Failed to load timeline' }); }
});
