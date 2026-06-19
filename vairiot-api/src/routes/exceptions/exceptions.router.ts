import { Router, Request, Response } from 'express';

import { asyncHandler } from '../../middleware/error-handler';
import { prisma } from '../../lib/prisma';

export const exceptionsRouter = Router();

exceptionsRouter.get('/',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.user!.tenantId;

    const [
      missingDocuments,
      overdueMaintenanceCount,
      expiredWarrantyCount,
      unlocatedAssetCount,
    ] = await Promise.all([
      prisma.asset.count({
        where: {
          tenantId, deletedAt: null, status: { not: 'disposed' },
          documents: { none: {} },
        },
      }),
      prisma.maintenanceEvent.count({
        where: {
          tenantId, status: 'scheduled',
          scheduledDate: { lt: new Date() },
        },
      }),
      prisma.asset.count({
        where: {
          tenantId, deletedAt: null, status: { not: 'disposed' },
          warrantyExpiry: { lt: new Date() },
        },
      }),
      prisma.asset.count({
        where: {
          tenantId, deletedAt: null, status: { not: 'disposed' },
          siteId: null,
        },
      }),
    ]);

    const overdueMaintenanceEvents = await prisma.maintenanceEvent.findMany({
      where: {
        tenantId, status: 'scheduled',
        scheduledDate: { lt: new Date() },
      },
      take: 20,
      orderBy: { scheduledDate: 'asc' },
      select: {
        id: true, maintenanceType: true, scheduledDate: true, vendor: true, status: true,
        asset: { select: { id: true, assetNumber: true, name: true } },
      },
    });

    const expiredWarrantyAssets = await prisma.asset.findMany({
      where: {
        tenantId, deletedAt: null, status: { not: 'disposed' },
        warrantyExpiry: { lt: new Date() },
      },
      take: 20,
      orderBy: { warrantyExpiry: 'asc' },
      select: { id: true, assetNumber: true, name: true, warrantyExpiry: true },
    });

    const unlocatedAssets = await prisma.asset.findMany({
      where: {
        tenantId, deletedAt: null, status: { not: 'disposed' },
        siteId: null,
      },
      take: 20,
      orderBy: { assetNumber: 'asc' },
      select: { id: true, assetNumber: true, name: true },
    });

    res.json({
      summary: {
        missingDocuments,
        overdueMaintenanceCount,
        expiredWarrantyCount,
        unlocatedAssetCount,
      },
      overdueMaintenanceEvents,
      expiredWarrantyAssets,
      unlocatedAssets,
    });
  }),
);
