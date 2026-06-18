import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, requirePermission } from '../../middleware/authenticate';
import {
  listWebhooks, createWebhook, deleteWebhook, toggleWebhook, getValidEvents,
} from '../../services/webhook.service';

export const webhooksRouter = Router();
webhooksRouter.use(authenticate);
webhooksRouter.use(requirePermission('apikey:write'));

webhooksRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await listWebhooks(req.user!.tenantId));
  } catch { res.status(500).json({ error: 'Failed to list webhooks' }); }
});

webhooksRouter.get('/events', (_req: Request, res: Response): void => {
  res.json(getValidEvents());
});

webhooksRouter.post(
  '/',
  [
    body('name').isString().notEmpty(),
    body('url').isURL(),
    body('events').isArray({ min: 1 }),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    try {
      const wh = await createWebhook(req.user!.tenantId, req.user!.sub, req.body);
      res.status(201).json(wh);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('INVALID_EVENTS')) { res.status(400).json({ error: e.message }); return; }
      res.status(500).json({ error: 'Failed to create webhook' });
    }
  },
);

webhooksRouter.patch('/:id/toggle', async (req: Request, res: Response): Promise<void> => {
  try {
    const wh = await toggleWebhook(req.user!.tenantId, req.params.id, req.body.active);
    res.json(wh);
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') { res.status(404).json({ error: 'Webhook not found' }); return; }
    res.status(500).json({ error: 'Failed to toggle webhook' });
  }
});

webhooksRouter.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await deleteWebhook(req.user!.tenantId, req.params.id));
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') { res.status(404).json({ error: 'Webhook not found' }); return; }
    res.status(500).json({ error: 'Failed to delete webhook' });
  }
});
