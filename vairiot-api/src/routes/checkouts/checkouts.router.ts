import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';

import { requireAnyPermission } from '../../middleware/authorise';
import { asyncHandler } from '../../middleware/error-handler';
import { checkoutAsset, checkinAsset, getCheckoutHistory, listActiveCheckouts, getOverdueCheckouts } from '../../services/checkout.service';

export const checkoutsRouter = Router();

checkoutsRouter.get('/',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { search, sortBy, sortOrder } = req.query as Record<string, string>;
    res.json(await listActiveCheckouts(req.user!.tenantId, { search, sortBy, sortOrder }));
  }),
);

checkoutsRouter.get('/overdue',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { search, sortBy, sortOrder } = req.query as Record<string, string>;
    res.json(await getOverdueCheckouts(req.user!.tenantId, { search, sortBy, sortOrder }));
  }),
);

checkoutsRouter.post('/', requireAnyPermission('asset:write'),
  [body('assetId').notEmpty(), body('custodianId').notEmpty()],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    res.status(201).json(await checkoutAsset(req.user!.tenantId, req.user!.sub, req.body));
  }),
);

checkoutsRouter.post('/:assetId/checkin', requireAnyPermission('asset:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await checkinAsset(req.user!.tenantId, req.user!.sub, req.params.assetId));
  }),
);

checkoutsRouter.get('/:assetId/history',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await getCheckoutHistory(req.user!.tenantId, req.params.assetId));
  }),
);
