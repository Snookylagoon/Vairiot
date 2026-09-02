import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';

import { requireAnyPermission } from '../../middleware/authorise';
import { asyncHandler } from '../../middleware/error-handler';
import {
  activatePrefix,
  createPrefix,
  getIdentification,
  listPrefixes,
  previewPrefix,
  updateIdentification,
  withdrawPrefix,
} from '../../services/gs1-identification.service';
import type { Request } from '../../types/http';

export const identificationRouter = Router();

identificationRouter.get('/', requireAnyPermission('gs1:admin', 'asset:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await getIdentification(req.user!.tenantId));
  }),
);

identificationRouter.patch('/', requireAnyPermission('gs1:admin'),
  [
    body('slug').optional().isString().trim(),
    body('tenantMark').optional({ nullable: true }).isString().trim().isLength({ max: 12 }),
    body('filterValue').optional().isInt({ min: 0, max: 7 }),
    body('allowGiai202').optional().isBoolean(),
    body('allowInternalPermalock').optional().isBoolean(),
    body('settlingPeriodDays').optional().isInt({ min: 0, max: 3650 }),
    body('tidSampleRate').optional().isFloat({ min: 0, max: 1 }),
    body('digitalLinkHost').optional().isString().trim(),
  ],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    res.json(await updateIdentification(req.user!.tenantId, req.user!.sub, req.body));
  }),
);

identificationRouter.get('/prefixes', requireAnyPermission('gs1:admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await listPrefixes(req.user!.tenantId));
  }),
);

identificationRouter.post('/prefixes', requireAnyPermission('gs1:admin'),
  [
    body('prefix').isString().trim().matches(/^\d{6,12}$/),
    body('gs1MemberOrg').isString().trim().notEmpty(),
    body('licensedOn').optional().isISO8601(),
    body('capacity').optional().isInt({ min: 1 }),
    body('notes').optional().isString(),
  ],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    res.status(201).json(await createPrefix(req.user!.tenantId, req.user!.sub, req.body));
  }),
);

identificationRouter.get('/prefixes/preview', requireAnyPermission('gs1:admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const ident = await getIdentification(req.user!.tenantId);
    res.json(previewPrefix(String(req.query.prefix ?? ''), ident.slug));
  }),
);

identificationRouter.post('/prefixes/:id/activate', requireAnyPermission('gs1:admin'),
  [body('confirmAssetCount').optional().isInt({ min: 0 })],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    res.json(await activatePrefix(req.user!.tenantId, req.user!.sub, req.params.id, {
      confirmAssetCount: req.body.confirmAssetCount,
    }));
  }),
);

identificationRouter.post('/prefixes/:id/supersede', requireAnyPermission('gs1:admin'),
  [body('reason').isString().trim().notEmpty()],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    res.json(await activatePrefix(req.user!.tenantId, req.user!.sub, req.params.id, {
      reason: req.body.reason,
    }));
  }),
);

identificationRouter.post('/prefixes/:id/withdraw', requireAnyPermission('gs1:admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await withdrawPrefix(req.user!.tenantId, req.user!.sub, req.params.id));
  }),
);
