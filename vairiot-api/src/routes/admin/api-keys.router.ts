import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';

import { requireAnyPermission } from '../../middleware/authorise';
import { asyncHandler } from '../../middleware/error-handler';
import { listApiKeys, createApiKey, revokeApiKey } from '../../services/api-key.service';

export const apiKeysRouter = Router();
apiKeysRouter.use(requireAnyPermission('apikey:read', 'apikey:write'));

apiKeysRouter.get('/',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await listApiKeys(req.user!.tenantId));
  }),
);

apiKeysRouter.post('/', requireAnyPermission('apikey:write'),
  [
    body('name').notEmpty(),
    body('scopes').optional().isArray(),
  ],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    res.status(201).json(await createApiKey(req.user!.tenantId, req.user!.sub, req.body));
  }),
);

apiKeysRouter.delete('/:keyId', requireAnyPermission('apikey:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await revokeApiKey(req.user!.tenantId, req.user!.sub, req.params.keyId));
  }),
);
