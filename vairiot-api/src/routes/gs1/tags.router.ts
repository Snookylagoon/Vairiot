import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';

import { requireAnyPermission } from '../../middleware/authorise';
import { asyncHandler } from '../../middleware/error-handler';
import {
  commissionTag,
  permalockTag,
  retireTag,
  verifyTag,
} from '../../services/gs1-tag.service';
import type { Request } from '../../types/http';

export const tagsRouter = Router();

tagsRouter.post('/commission', requireAnyPermission('tag:commission'),
  [
    body('assetId').isString().notEmpty(),
    body('tidHex').isString().trim().isLength({ min: 24 }),
    body('chipModel').optional().isString().trim(),
    body('tagModel').optional().isString().trim(),
    body('formFactor').optional().isIn(['LABEL', 'ON_METAL', 'HARD_TAG', 'SEWN_IN', 'PLATE']),
    body('deviceId').optional().isString(),
  ],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    res.json(await commissionTag(req.user!.tenantId, req.user!.sub, req.body));
  }),
);

tagsRouter.post('/:id/verify', requireAnyPermission('tag:commission'),
  [
    body('assetId').isString().notEmpty(),
    body('readEpcHex').isString().trim().notEmpty(),
    body('readTidHex').isString().trim().notEmpty(),
    body('writeAttempts').optional().isInt({ min: 0 }),
    body('peakRssiDbm').optional().isInt({ min: -99, max: 0 }),
    body('deviceId').optional().isString(),
  ],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    res.json(await verifyTag(req.user!.tenantId, req.user!.sub, req.params.id, req.body));
  }),
);

tagsRouter.post('/:id/permalock', requireAnyPermission('tag:commission'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await permalockTag(req.user!.tenantId, req.user!.sub, req.params.id));
  }),
);

tagsRouter.post('/:id/retire', requireAnyPermission('tag:commission'),
  [body('reason').isString().trim().notEmpty()],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    res.json(await retireTag(req.user!.tenantId, req.user!.sub, req.params.id, req.body.reason));
  }),
);
