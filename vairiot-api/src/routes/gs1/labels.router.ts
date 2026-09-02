import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';

import { prisma } from '../../lib/prisma';
import { requireAnyPermission } from '../../middleware/authorise';
import { asyncHandler } from '../../middleware/error-handler';
import {
  markScanVerified,
  recordLabelPrints,
} from '../../services/gs1-label.service';
import type { Request } from '../../types/http';

export const labelsRouter = Router();

/* ── Label templates (saved label designs) ─────────────────────────────── */

labelsRouter.get('/templates', requireAnyPermission('asset:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await prisma.labelTemplate.findMany({
      where: { tenantId: req.user!.tenantId },
      orderBy: { name: 'asc' },
    }));
  }),
);

// Create-or-update by name: "Save template" from the label designer.
labelsRouter.post('/templates', requireAnyPermission('asset:write'),
  [
    body('name').isString().trim().notEmpty().isLength({ max: 100 }),
    body('config').isObject(),
  ],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    const { name, config } = req.body;
    const template = await prisma.labelTemplate.upsert({
      where: { tenantId_name: { tenantId: req.user!.tenantId, name } },
      create: { tenantId: req.user!.tenantId, name, config, createdBy: req.user!.sub },
      update: { config },
    });
    res.json(template);
  }),
);

labelsRouter.put('/templates/:id', requireAnyPermission('asset:write'),
  [
    body('name').optional().isString().trim().notEmpty().isLength({ max: 100 }),
    body('config').optional().isObject(),
  ],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    const existing = await prisma.labelTemplate.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!existing) { res.status(404).json({ error: 'Template not found' }); return; }
    const template = await prisma.labelTemplate.update({
      where: { id: existing.id },
      data: {
        ...(req.body.name ? { name: req.body.name } : {}),
        ...(req.body.config ? { config: req.body.config } : {}),
      },
    });
    res.json(template);
  }),
);

labelsRouter.delete('/templates/:id', requireAnyPermission('asset:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const existing = await prisma.labelTemplate.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!existing) { res.status(404).json({ error: 'Template not found' }); return; }
    await prisma.labelTemplate.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  }),
);

/* ── Label prints ──────────────────────────────────────────────────────── */

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
