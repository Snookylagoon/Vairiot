import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate } from '../../middleware/authenticate';
import { listApiKeys, createApiKey, revokeApiKey } from '../../services/api-key.service';

export const apiKeysRouter = Router();
apiKeysRouter.use(authenticate);

apiKeysRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try { res.json(await listApiKeys(req.user!.tenantId)); }
  catch { res.status(500).json({ error: 'Failed to fetch API keys' }); }
});

apiKeysRouter.post('/',
  [
    body('name').notEmpty(),
    body('scopes').optional().isArray(),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    try {
      const result = await createApiKey(req.user!.tenantId, req.user!.sub, req.body);
      res.status(201).json(result);
    } catch { res.status(500).json({ error: 'Failed to create API key' }); }
  },
);

apiKeysRouter.delete('/:keyId', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await revokeApiKey(req.user!.tenantId, req.params.keyId));
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') { res.status(404).json({ error: 'API key not found' }); return; }
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});
