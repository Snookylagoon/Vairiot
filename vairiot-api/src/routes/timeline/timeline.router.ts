import { Router, Request, Response } from 'express';

import { requireAnyPermission } from '../../middleware/authorise';
import { asyncHandler } from '../../middleware/error-handler';
import { getAssetTimeline } from '../../services/timeline.service';

export const timelineRouter = Router();

timelineRouter.get('/:assetId', requireAnyPermission('asset:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await getAssetTimeline(req.user!.tenantId, req.params.assetId));
  }),
);
