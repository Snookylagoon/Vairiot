import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';

import { toCsv } from '../../lib/csv';
import { logger } from '../../lib/logger';
import { enqueueAuditComplete } from '../../lib/queue';
import { requireAnyPermission } from '../../middleware/authorise';
import { asyncHandler } from '../../middleware/error-handler';
import { requireFeature } from '../../middleware/require-feature';
import { listScanPositions } from '../../services/audit-scan.service';
import { listCampaigns, createCampaign, startCampaign, recordScan, submitZone, listZoneSubmissions, completeCampaign, getReconciliation, postAdjustment, listAdjustments, getCampaignReport, getCampaignReportRows, getComparison } from '../../services/audit.service';
import { getCampaignMap } from '../../services/campaign-map.service';
import { photoWarnings } from '../../services/condition.service';
import type { Request } from '../../types/http';

interface ReportRows {
  campaign: { id: string; name: string };
  scans: Array<{ result: string; tagValue: string; asset: { assetNumber: string; name: string; category?: { name: string } | null; site?: { name: string } | null; location?: { name: string } | null } | null; scannedAt: Date; deviceId: string | null }>;
  missing: Array<{ assetNumber: string; name: string; category?: { name: string } | null; site?: { name: string } | null; location?: { name: string } | null }>;
}
function buildReportCsv(rows: ReportRows): string {
  const scanRows = rows.scans.map(s => ({
    result: s.result, tagValue: s.tagValue,
    assetNumber: s.asset?.assetNumber ?? '', assetName: s.asset?.name ?? '',
    category: s.asset?.category?.name ?? '', site: s.asset?.site?.name ?? '', location: s.asset?.location?.name ?? '',
    scannedAt: s.scannedAt.toISOString(), deviceId: s.deviceId ?? '',
  }));
  const missingRows = rows.missing.map(a => ({
    result: 'missing', tagValue: '', assetNumber: a.assetNumber, assetName: a.name,
    category: a.category?.name ?? '', site: a.site?.name ?? '', location: a.location?.name ?? '',
    scannedAt: '', deviceId: '',
  }));
  return toCsv([...scanRows, ...missingRows], [
    { key: 'result', header: 'Result' }, { key: 'tagValue', header: 'Tag' },
    { key: 'assetNumber', header: 'Asset Number' }, { key: 'assetName', header: 'Asset Name' },
    { key: 'category', header: 'Category' }, { key: 'site', header: 'Site' }, { key: 'location', header: 'Location' },
    { key: 'scannedAt', header: 'Scanned At' }, { key: 'deviceId', header: 'Device' },
  ]);
}

export const auditsRouter = Router();

auditsRouter.get('/',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await listCampaigns(req.user!.tenantId));
  }),
);

auditsRouter.post('/', requireAnyPermission('audit:write'),
  [
    body('name').notEmpty(),
    body('mode').optional().isIn(['sighted', 'blind']),
    body('siteId').optional({ nullable: true }).isString(),
    body('locationId').optional({ nullable: true }).isString(),
    body('categoryId').optional({ nullable: true }).isString(),
    body('assetIds').optional({ nullable: true }).isArray(),
    body('assetIds.*').optional().isString(),
    body('linkedCampaignId').optional({ nullable: true }).isString(),
    body('scheduledAt').optional({ nullable: true }).isString(),
  ],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    const { name, mode, siteId, locationId, categoryId, assetIds, linkedCampaignId, scheduledAt } = req.body ?? {};
    res.status(201).json(await createCampaign(req.user!.tenantId, req.user!.sub, {
      name, mode, siteId, locationId, categoryId, assetIds, linkedCampaignId, scheduledAt,
    }));
  }),
);

auditsRouter.post('/:id/start', requireAnyPermission('audit:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await startCampaign(req.user!.tenantId, req.params.id));
  }),
);

auditsRouter.post('/:id/scans', requireAnyPermission('audit:write'),
  [
    body('tagValue').notEmpty(),
    body('locationId').optional({ nullable: true }).isString(),
    body('condition').optional({ nullable: true }).isIn(['new', 'good', 'fair', 'poor', 'damaged']),
    body('conditionGrade').optional({ nullable: true }).isInt({ min: 1, max: 5 }).toInt(),
    body('clientRequestId').optional({ nullable: true }).isString().isLength({ max: 64 }),
    body('capturedAt').optional({ nullable: true }).isISO8601(),
    // Positions are checked in resolveScanGeo, which drops a bad one rather
    // than refusing the scan.
  ],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    const event = await recordScan(req.user!.tenantId, req.params.id, req.user!.sub, req.body);
    // A replayed clientRequestId returns the original event: 200, not 201.
    res.status('duplicate' in event && event.duplicate ? 200 : 201).json(event);
  }),
);

// Campaign layer of the asset map (stage 1.10): expected assets coloured by
// count state, plus surplus tags at their scan position; 404 with GIS off.
auditsRouter.get('/:id/map', requireAnyPermission('audit:read', 'audit:write'), requireFeature('gis'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await getCampaignMap(req.user!.tenantId, req.params.id));
  }),
);

// Positioned scans of a campaign as GeoJSON (stage 1.5); 404 with GIS off.
auditsRouter.get('/:id/scans/geo', requireAnyPermission('audit:read', 'audit:write'), requireFeature('gis'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await listScanPositions(req.user!.tenantId, req.params.id));
  }),
);

// Scans that miss the photo rules (stage 1.13), for a zone or the campaign.
auditsRouter.get('/:id/photo-warnings', requireAnyPermission('audit:read', 'audit:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const locationId = typeof req.query.locationId === 'string' ? req.query.locationId : undefined;
    res.json(await photoWarnings(req.user!.tenantId, req.params.id, locationId));
  }),
);

auditsRouter.post('/:id/zones/:locationId/submit', requireAnyPermission('audit:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const submission = await submitZone(req.user!.tenantId, req.params.id, req.params.locationId, req.user!.sub);
    // Photo rules warn, never block (S1.3 step 6, stage 1.13).
    const warnings = await photoWarnings(req.user!.tenantId, req.params.id, req.params.locationId);
    res.status(201).json({ ...submission, photoWarnings: warnings });
  }),
);

auditsRouter.get('/:id/zones',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await listZoneSubmissions(req.user!.tenantId, req.params.id));
  }),
);

auditsRouter.post('/:id/complete', requireAnyPermission('audit:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { justCompleted, ...summary } = await completeCampaign(req.user!.tenantId, req.params.id);
    if (justCompleted) {
      void (async () => {
        try {
          const rows = await getCampaignReportRows(req.user!.tenantId, req.params.id);
          await enqueueAuditComplete({
            tenantId:       req.user!.tenantId,
            campaignId:     rows.campaign.id,
            campaignName:   rows.campaign.name,
            recipientEmail: req.user!.email,
            summary: {
              totalExpected: summary.totalExpected,
              totalScanned:  summary.totalScanned,
              found:         summary.found,
              missingCount:  summary.missing.length,
              unknownCount:  summary.unknownTags.length,
            },
            csv:         buildReportCsv(rows),
            completedAt: new Date().toISOString(),
          });
        } catch (e) {
          logger.error(`Failed to enqueue audit-complete notification: ${(e as Error).message}`);
        }
      })();
    }
    res.json(summary);
  }),
);

auditsRouter.get('/:id/reconciliation',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await getReconciliation(req.user!.tenantId, req.params.id));
  }),
);

auditsRouter.post('/:id/adjustments', requireAnyPermission('audit:approve'),
  [
    body('reconciliationItemId').notEmpty().isString(),
    body('adjustmentType').notEmpty().isIn(['update_location', 'update_condition', 'write_off', 'register_new', 'no_action']),
    body('fieldChanged').optional({ nullable: true }).isString(),
    body('valueAfter').optional({ nullable: true }).isString(),
    body('justification').notEmpty().isString(),
    body('applyToRegister').optional().isBoolean(),
  ],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    res.status(201).json(await postAdjustment(req.user!.tenantId, req.params.id, req.user!.sub, req.body));
  }),
);

auditsRouter.get('/:id/adjustments',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await listAdjustments(req.user!.tenantId, req.params.id));
  }),
);

auditsRouter.get('/:id/comparison',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await getComparison(req.user!.tenantId, req.params.id));
  }),
);

auditsRouter.get('/:id/export.csv',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const rows = await getCampaignReportRows(req.user!.tenantId, req.params.id);
    const safeName = rows.campaign.name.replace(/[^a-z0-9-]+/gi, '_').slice(0, 40);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-${safeName}-${rows.campaign.id.slice(0, 8)}.csv"`);
    res.send(buildReportCsv(rows));
  }),
);

auditsRouter.get('/:id/report',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await getCampaignReport(req.user!.tenantId, req.params.id));
  }),
);
