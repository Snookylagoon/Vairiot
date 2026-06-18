import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, requirePermission } from '../../middleware/authenticate';
import { listTransfers, createTransfer } from '../../services/transfer.service';

export const transfersRouter = Router();
transfersRouter.use(authenticate);

transfersRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { assetId, page, pageSize } = req.query as Record<string, string>;
    res.json(await listTransfers(req.user!.tenantId, {
      assetId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    }));
  } catch { res.status(500).json({ error: 'Failed to list transfers' }); }
});

transfersRouter.post(
  '/',
  requirePermission('asset:write'),
  [body('assetId').isString().notEmpty()],
  async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    try {
      const transfer = await createTransfer(req.user!.tenantId, req.user!.sub, req.body);
      res.status(201).json(transfer);
    } catch (e) {
      if (e instanceof Error && e.message === 'ASSET_NOT_FOUND') { res.status(404).json({ error: 'Asset not found' }); return; }
      res.status(500).json({ error: 'Failed to create transfer' });
    }
  },
);
