import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, requireAnyPermission } from '../../middleware/authenticate';
import { asyncHandler } from '../../middleware/error-handler';
import {
  listWebhooks, createWebhook, deleteWebhook, toggleWebhook, getValidEvents,
} from '../../services/webhook.service';

export const webhooksRouter = Router();
webhooksRouter.use(authenticate);
webhooksRouter.use(requireAnyPermission('apikey:write'));

webhooksRouter.get('/',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await listWebhooks(req.user!.tenantId));
  }),
);

webhooksRouter.get('/events', (_req: Request, res: Response): void => {
  res.json(getValidEvents());
});

webhooksRouter.post('/',
  [
    body('name').isString().notEmpty(),
    body('url').isURL(),
    body('events').isArray({ min: 1 }),
  ],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    res.status(201).json(await createWebhook(req.user!.tenantId, req.user!.sub, req.body));
  }),
);

webhooksRouter.patch('/:id/toggle',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await toggleWebhook(req.user!.tenantId, req.params.id, req.body.active));
  }),
);

webhooksRouter.delete('/:id',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await deleteWebhook(req.user!.tenantId, req.params.id));
  }),
);
