import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, requireAnyPermission } from '../../middleware/authenticate';
import { asyncHandler } from '../../middleware/error-handler';
import { listTransfers, createTransfer } from '../../services/transfer.service';

export const transfersRouter = Router();
transfersRouter.use(authenticate);

transfersRouter.get('/',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { assetId, page, pageSize } = req.query as Record<string, string>;
    res.json(await listTransfers(req.user!.tenantId, {
      assetId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    }));
  }),
);

transfersRouter.post('/', requireAnyPermission('asset:write'),
  [body('assetId').isString().notEmpty()],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    res.status(201).json(await createTransfer(req.user!.tenantId, req.user!.sub, req.body));
  }),
);
