import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate } from '../../middleware/authenticate';
import {
  listSubscriptions, upsertSubscription, deleteSubscription, toggleSubscription,
} from '../../services/alert.service';

export const alertsRouter = Router();
alertsRouter.use(authenticate);

alertsRouter.get('/subscriptions', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await listSubscriptions(req.user!.tenantId, req.user!.sub));
  } catch { res.status(500).json({ error: 'Failed to list subscriptions' }); }
});

alertsRouter.post(
  '/subscriptions',
  [body('exceptionType').isString().notEmpty()],
  async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    try {
      const sub = await upsertSubscription(req.user!.tenantId, req.user!.sub, req.body);
      res.status(201).json(sub);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('INVALID')) { res.status(400).json({ error: e.message }); return; }
      res.status(500).json({ error: 'Failed to create subscription' });
    }
  },
);

alertsRouter.patch('/subscriptions/:type/toggle', async (req: Request, res: Response): Promise<void> => {
  try {
    const { active } = req.body;
    const sub = await toggleSubscription(req.user!.tenantId, req.user!.sub, req.params.type, active);
    res.json(sub);
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') { res.status(404).json({ error: 'Subscription not found' }); return; }
    res.status(500).json({ error: 'Failed to toggle subscription' });
  }
});

alertsRouter.delete('/subscriptions/:type', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await deleteSubscription(req.user!.tenantId, req.user!.sub, req.params.type));
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') { res.status(404).json({ error: 'Subscription not found' }); return; }
    res.status(500).json({ error: 'Failed to delete subscription' });
  }
});
