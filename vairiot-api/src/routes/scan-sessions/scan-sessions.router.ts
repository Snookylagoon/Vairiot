import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { requireAnyPermission } from '../../middleware/authorise';
import { asyncHandler } from '../../middleware/error-handler';
import { uploadScanSession } from '../../services/scan-session.service';

export const scanSessionsRouter = Router();

scanSessionsRouter.post('/', requireAnyPermission('scan:execute'),
  [
    body('sessionId').notEmpty().isString(),
    body('siteId').optional({ nullable: true }).isString(),
    body('categoryId').optional({ nullable: true }).isString(),
    body('createdAtMs').isNumeric(),
    body('completedAtMs').isNumeric(),
    body('tags').isArray(),
    body('tags.*.epc').notEmpty().isString(),
    body('tags.*.status').notEmpty().isString(),
    body('tags.*.readCount').isNumeric(),
    body('tags.*.firstSeenMs').isNumeric(),
    body('tags.*.lastSeenMs').isNumeric(),
    body('tags.*.assetId').optional({ nullable: true }).isString(),
  ],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    const { sessionId, siteId, categoryId, createdAtMs, completedAtMs, tags } = req.body;
    const result = await uploadScanSession(req.user!.tenantId, req.user!.sub, {
      sessionId, siteId, categoryId, createdAtMs, completedAtMs, tags,
    });
    res.status(201).json(result);
  }),
);
