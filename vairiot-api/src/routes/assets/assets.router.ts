import { Router, Response } from 'express';
import { body, query, validationResult } from 'express-validator';
import { parentDisposalChoice } from 'vairiot-shared';

import { requireAnyPermission } from '../../middleware/authorise';
import { asyncHandler } from '../../middleware/error-handler';
import { requireFeature } from '../../middleware/require-feature';
import { enforceAssetCap } from '../../services/asset-cap.service';
import { listAssetEvents } from '../../services/asset-event.service';
import { listAssetsInBbox, parseBbox, parseGeoLimit } from '../../services/asset-geo-query.service';
import { listAssets, listAssetChanges, listAssetPositions, getAsset, createAssetIdempotent, findAssetByClientRequestId, updateAsset, deleteAsset, disposeAsset, getAssetByTag, getAssetStats } from '../../services/asset.service';
import { prepareParentDisposal } from '../../services/component.service';
import { encodeIdentifier } from '../../services/gs1-identifier.service';
import { listLabelPrints } from '../../services/gs1-label.service';
import { getAssetByEpc, listTagsForAsset } from '../../services/gs1-tag.service';
import { registerCsv } from '../../services/register-export.service';
import type { Request } from '../../types/http';

export const assetsRouter = Router();

assetsRouter.get('/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('pageSize').optional().isInt({ min: 1, max: 200 }),
    query('changedSince').optional().isISO8601({ strict: true }),
    query('changedUntil').optional().isISO8601({ strict: true }),
  ],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }

    // Delta sync for mobile caches: only what changed, plus deletions.
    if (typeof req.query.changedSince === 'string') {
      res.json(await listAssetChanges(req.user!.tenantId, {
        since:      new Date(req.query.changedSince),
        until:      typeof req.query.changedUntil === 'string' ? new Date(req.query.changedUntil) : undefined,
        categoryId: req.query.categoryId as string,
        siteId:     req.query.siteId as string,
        status:     req.query.status as string,
        condition:  req.query.condition as string,
        page:       Number(req.query.page) || 1,
        pageSize:   Number(req.query.pageSize) || 50,
      }));
      return;
    }

    res.json(await listAssets(req.user!.tenantId, {
      search:     req.query.search as string,
      categoryId: req.query.categoryId as string,
      siteId:     req.query.siteId as string,
      status:     req.query.status as string,
      condition:  req.query.condition as string,
      sortBy:     req.query.sortBy as string,
      sortOrder:  req.query.sortOrder as string,
      page:       Number(req.query.page) || 1,
      pageSize:   Number(req.query.pageSize) || 50,
      includeDeleted: req.query.includeDeleted === 'true',
      rollUp:     req.query.rollUp === 'true',
    }));
  }),
);

assetsRouter.get('/export.csv', requireAnyPermission('asset:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const csv = await registerCsv(req.user!.tenantId, {
      search:     req.query.search as string,
      categoryId: req.query.categoryId as string,
      siteId:     req.query.siteId as string,
      status:     req.query.status as string,
      condition:  req.query.condition as string,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="assets-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(csv);
  }),
);

assetsRouter.get('/stats', requireAnyPermission('asset:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await getAssetStats(req.user!.tenantId));
  }),
);

// Positions for the all-assets map. Same filters as the list. 404 when the
// tenant has GIS switched off (D7).
assetsRouter.get('/map', requireAnyPermission('asset:read'), requireFeature('gis'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await listAssetPositions(req.user!.tenantId, {
      search:     req.query.search as string,
      categoryId: req.query.categoryId as string,
      siteId:     req.query.siteId as string,
      status:     req.query.status as string,
      condition:  req.query.condition as string,
    }));
  }),
);

// GeoJSON of the tenant's assets inside a bounding box (stage 1.4, PostGIS).
assetsRouter.get('/geo', requireAnyPermission('asset:read'), requireFeature('gis'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const bbox = parseBbox(req.query.bbox);
    res.json(await listAssetsInBbox(req.user!.tenantId, bbox, parseGeoLimit(req.query.limit)));
  }),
);

assetsRouter.get('/tag/:tag',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await getAssetByTag(req.user!.tenantId, req.params.tag));
  }),
);

// EPC → asset resolution. A GIAI-96 EPC belonging to another tenant's ACTIVE
// prefix returns FOREIGN_TAG metadata rather than 404 (GS1 spec §6.6).
assetsRouter.get('/by-epc/:epcHex', requireAnyPermission('asset:read', 'scan:execute'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await getAssetByEpc(req.user!.tenantId, req.params.epcHex));
  }),
);

// GS1 identity bundle for one asset: encoding, tag bindings, label prints,
// hash-chained event log.
assetsRouter.get('/:id/gs1', requireAnyPermission('asset:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const asset = await getAsset(req.user!.tenantId, req.params.id);
    const iar = (asset as { individualAssetReference?: string | null }).individualAssetReference;
    const [encoding, bindings, prints, events] = await Promise.all([
      iar ? encodeIdentifier(req.user!.tenantId, { individualAssetReference: iar }) : null,
      listTagsForAsset(req.user!.tenantId, req.params.id),
      listLabelPrints(req.user!.tenantId, req.params.id),
      listAssetEvents(req.user!.tenantId, req.params.id),
    ]);
    res.json({
      encoding,
      bindings,
      labelPrints: prints,
      events: events.map((e) => ({ ...e, seq: Number(e.seq), prevHash: undefined, hash: undefined })),
    });
  }),
);

assetsRouter.get('/:id',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await getAsset(req.user!.tenantId, req.params.id));
  }),
);

assetsRouter.post('/', requireAnyPermission('asset:write'),
  [
    body('name').notEmpty().withMessage('Asset name required'),
    body('clientRequestId').optional({ nullable: true }).isString().isLength({ max: 64 }),
    body('conditionGrade').optional({ nullable: true }).isInt({ min: 1, max: 5 }).toInt(),
    body('custodian').optional({ nullable: true }).isString().isLength({ max: 120 }),
  ],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    const tenantId = req.user!.tenantId;
    const clientRequestId = typeof req.body.clientRequestId === 'string' ? req.body.clientRequestId : undefined;
    // A replay of a create that already succeeded returns the original with 200,
    // before the licence cap check: a tenant at its cap must still get back the
    // asset it already has, or the device would park it as rejected.
    if (clientRequestId) {
      const existing = await findAssetByClientRequestId(tenantId, clientRequestId);
      if (existing) { res.status(200).json(existing); return; }
    }
    await enforceAssetCap(tenantId);
    const { asset, created } = await createAssetIdempotent(tenantId, req.user!.sub, req.body);
    res.status(created ? 201 : 200).json(asset);
  }),
);

assetsRouter.patch('/:id', requireAnyPermission('asset:write'),
  [
    body('conditionGrade').optional({ nullable: true }).isInt({ min: 1, max: 5 }).toInt(),
    body('custodian').optional({ nullable: true }).isString().isLength({ max: 120 }),
  ],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    res.json(await updateAsset(req.user!.tenantId, req.params.id, req.user!.sub, req.body));
  }),
);

assetsRouter.delete('/:id', requireAnyPermission('asset:delete'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await deleteAsset(req.user!.tenantId, req.params.id, req.user!.sub);
    res.status(204).send();
  }),
);

assetsRouter.post('/:id/dispose', requireAnyPermission('asset:write'),
  [
    body('disposalDate').notEmpty().withMessage('Disposal date is required'),
    body('disposalMethod').notEmpty().withMessage('Disposal method is required'),
  ],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    const { tenantId, sub } = req.user!;
    // A parent with components: `components: 'dispose' | 'detach'` (S2.2), else 409.
    const choice = parentDisposalChoice.optional().safeParse(req.body.components);
    if (!choice.success) { res.status(400).json({ error: 'components must be dispose or detach' }); return; }
    await prepareParentDisposal(tenantId, req.params.id, choice.data, (componentId) => disposeAsset(tenantId, componentId, sub, {
      disposalDate: req.body.disposalDate, disposalMethod: req.body.disposalMethod, disposalValue: 0, disposalReason: 'Disposed with its parent',
    }), sub);
    res.json(await disposeAsset(tenantId, req.params.id, sub, req.body));
  }),
);
