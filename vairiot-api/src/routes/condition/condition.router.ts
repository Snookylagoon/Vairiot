import { Router, Response } from 'express';

import { requireAnyPermission } from '../../middleware/authorise';
import { asyncHandler } from '../../middleware/error-handler';
import { getConditionScale, getPhotoRules, putConditionScale, putPhotoRules } from '../../services/condition.service';
import type { Request } from '../../types/http';

// Condition scale and photo rules (Phase 1 W5, stage 1.13). Reading is open
// to every user (the apps show the criteria); changing needs company:manage.
export const conditionRouter = Router();

const categoryParam = (v: unknown) => (typeof v === 'string' && v ? v : null);

conditionRouter.get('/scale',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await getConditionScale(req.user!.tenantId, categoryParam(req.query.categoryId)));
  }),
);

conditionRouter.put('/scale', requireAnyPermission('company:manage'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { categoryId, entries } = req.body ?? {};
    res.json(await putConditionScale(req.user!.tenantId, req.user!.sub, categoryParam(categoryId), entries ?? null));
  }),
);

conditionRouter.get('/photo-rules',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await getPhotoRules(req.user!.tenantId));
  }),
);

conditionRouter.put('/photo-rules', requireAnyPermission('company:manage'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await putPhotoRules(req.user!.tenantId, req.user!.sub, req.body));
  }),
);
