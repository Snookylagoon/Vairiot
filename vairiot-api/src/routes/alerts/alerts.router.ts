import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate } from '../../middleware/authenticate';
import { asyncHandler } from '../../middleware/error-handler';
import {
  listSubscriptions, upsertSubscription, deleteSubscription, toggleSubscription,
} from '../../services/alert.service';

export const alertsRouter = Router();
alertsRouter.use(authenticate);

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
