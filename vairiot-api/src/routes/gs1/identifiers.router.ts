import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';

import { requireAnyPermission } from '../../middleware/authorise';
import { asyncHandler } from '../../middleware/error-handler';
import {
  allocateIdentifiers,
  encodeIdentifier,
  leaseBlock,
  listBlocks,
  settleBlock,
  validateIarPublic,
} from '../../services/gs1-identifier.service';

export const identifiersRouter = Router();

identifiersRouter.post('/allocate', requireAnyPermission('asset:write'),
  [
    body('count').optional().isInt({ min: 1, max: 100 }),
    body('purpose').isString().trim().notEmpty(),
  ],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    res.json(await allocateIdentifiers(
      req.user!.tenantId, req.user!.sub, req.body.count ?? 1, req.body.purpose,
    ));
  }),
);

identifiersRouter.post('/blocks', requireAnyPermission('device:manage'),
  [
    body('deviceId').isString().notEmpty(),
    body('size').optional().isInt({ min: 1, max: 5000 }),
    body('ttlHours').optional().isInt({ min: 1, max: 720 }),
  ],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    res.json(await leaseBlock(req.user!.tenantId, req.user!.sub, req.body));
  }),
);

identifiersRouter.get('/blocks', requireAnyPermission('device:manage'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await listBlocks(req.user!.tenantId, req.query.deviceId as string | undefined));
  }),
);

identifiersRouter.post('/blocks/:id/settle', requireAnyPermission('device:manage', 'scan:execute'),
  [body('nextUnconsumed').isInt({ min: 0 })],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    res.json(await settleBlock(req.user!.tenantId, req.user!.sub, req.params.id, {
      nextUnconsumed: Number(req.body.nextUnconsumed),
    }));
  }),
);

identifiersRouter.get('/:iar/validate', requireAnyPermission('asset:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(validateIarPublic(req.params.iar));
  }),
);

identifiersRouter.post('/encode', requireAnyPermission('asset:read', 'tag:commission'),
  [
    body('individualAssetReference').isString().trim().matches(/^\d{12}$/),
    body('tidHex').optional().isString().trim(),
  ],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    res.json(await encodeIdentifier(req.user!.tenantId, req.body));
  }),
);
