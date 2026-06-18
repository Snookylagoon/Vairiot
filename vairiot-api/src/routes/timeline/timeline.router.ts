import { Router, Request, Response } from 'express';
import { authenticate, requireAnyPermission } from '../../middleware/authenticate';
import { asyncHandler } from '../../middleware/error-handler';
import { getAssetTimeline } from '../../services/timeline.service';

export const timelineRouter = Router();
timelineRouter.use(authenticate);

timelineRouter.get('/:assetId', requireAnyPermission('asset:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await getAssetTimeline(req.user!.tenantId, req.params.assetId));
  }),
);
