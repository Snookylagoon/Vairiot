import { Prisma } from '@prisma/client';
import { Router, Response } from 'express';

import { ValidationError } from '../../lib/errors';
import { MapSettingsSchema, resolveMapSettings } from '../../lib/map-settings';
import { prisma } from '../../lib/prisma';
import { requireAnyPermission } from '../../middleware/authorise';
import { asyncHandler } from '../../middleware/error-handler';
import { requireFeature } from '../../middleware/require-feature';
import { recordAuditEvent } from '../../services/audit-event.service';
import type { Request } from '../../types/http';

// GIS module settings (stage 1.12). The whole router is behind the gis flag.
export const gisRouter = Router();
gisRouter.use(requireFeature('gis'));

gisRouter.get('/map-settings',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const t = await prisma.tenant.findUnique({ where: { id: req.user!.tenantId }, select: { mapSettings: true } });
    res.json(resolveMapSettings(t?.mapSettings));
  }),
);

gisRouter.put('/map-settings', requireAnyPermission('company:manage'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const parsed = MapSettingsSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => i.message).join('; '));
    const tenantId = req.user!.tenantId;
    const before = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { mapSettings: true } });
    await prisma.tenant.update({ where: { id: tenantId }, data: { mapSettings: parsed.data } });
    recordAuditEvent({
      tenantId, actor: req.user!.sub, entityType: 'tenant', entityId: tenantId, action: 'map_settings_updated',
      before: (before?.mapSettings ?? {}) as Prisma.InputJsonValue, after: parsed.data,
    });
    res.json(parsed.data);
  }),
);
