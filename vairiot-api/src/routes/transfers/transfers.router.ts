import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';

import { requireAnyPermission } from '../../middleware/authorise';
import { asyncHandler } from '../../middleware/error-handler';
import { requestTransfer } from '../../services/approvals/approval-wiring';
import { listTransfers } from '../../services/transfer.service';
import type { Request } from '../../types/http';

export const transfersRouter = Router();

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
    const r = await requestTransfer(req.user!.tenantId, req.user!.sub, req.body);
    if (r.approval) { res.status(202).json({ approvalRequest: r.approval }); return; }
    res.status(201).json(r.result);
  }),
);
