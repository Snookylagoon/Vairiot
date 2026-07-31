import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';

import { requireAnyPermission } from '../../middleware/authorise';
import { asyncHandler } from '../../middleware/error-handler';
import {
  markScanVerified,
  recordLabelPrints,
} from '../../services/gs1-label.service';

export const labelsRouter = Router();

labelsRouter.post('/print', requireAnyPermission('asset:write', 'tag:commission'),
  [
    body('assetIds').isArray({ min: 1, max: 200 }),
    body('assetIds.*').isString(),
    body('templateCode').isString().trim().notEmpty(),
    body('symbology').optional().isIn(['QR', 'GS1_128', 'DATAMATRIX']),
    body('deviceId').optional().isString(),
    body('printerId').optional().isString(),
  ],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    res.json(await recordLabelPrints(req.user!.tenantId, req.user!.sub, req.body));
  }),
);

labelsRouter.post('/:printId/scan-verified', requireAnyPermission('asset:write', 'tag:commission'),
  [body('scannedPayload').isString().notEmpty()],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    res.json(await markScanVerified(
      req.user!.tenantId, req.user!.sub, req.params.printId, req.body.scannedPayload,
    ));
  }),
);
