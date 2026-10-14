import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';

import { requireAnyPermission } from '../../middleware/authorise';
import { asyncHandler } from '../../middleware/error-handler';
import {
  listSubscriptions, upsertSubscription, deleteSubscription, toggleSubscription,
} from '../../services/alert.service';
import type { Request } from '../../types/http';

export const alertsRouter = Router();

// Alert subscriptions are about asset exceptions (overdue maintenance, expired
// warranties…), so they need asset read access. The router had no guard at all
// (KFR-041); client-plane writes are refused by requireClientScope in app.ts.
alertsRouter.use(requireAnyPermission('asset:read'));

alertsRouter.get('/subscriptions',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await listSubscriptions(req.user!.tenantId, req.user!.sub));
  }),
);

alertsRouter.post('/subscriptions',
  [body('exceptionType').isString().notEmpty()],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    res.status(201).json(await upsertSubscription(req.user!.tenantId, req.user!.sub, req.body));
  }),
);

alertsRouter.patch('/subscriptions/:type/toggle',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await toggleSubscription(req.user!.tenantId, req.user!.sub, req.params.type, req.body.active));
  }),
);

alertsRouter.delete('/subscriptions/:type',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await deleteSubscription(req.user!.tenantId, req.user!.sub, req.params.type));
  }),
);
