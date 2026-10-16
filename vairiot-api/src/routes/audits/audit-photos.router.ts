import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';

import { requireAnyPermission } from '../../middleware/authorise';
import { asyncHandler } from '../../middleware/error-handler';
import { listCampaignPhotos, uploadScanPhoto, PHOTO_TYPES } from '../../services/scan-photo.service';
import type { Request } from '../../types/http';
import { uploadFields } from '../photos/photos.router';

// Photos bound to audit scans (stage 1.7). Mounted at /audits next to
// auditsRouter. Downloads go through /photos/:id/download, which strips
// metadata (KFR-043).
export const auditPhotosRouter = Router();

auditPhotosRouter.post('/:id/scans/:scanRef/photos',
  requireAnyPermission('audit:write'),
  uploadFields,
  [
    body('photoType').optional({ nullable: true }).isIn([...PHOTO_TYPES]),
    body('capturedAt').optional({ nullable: true }).isISO8601(),
    body('deviceId').optional({ nullable: true }).isString().isLength({ max: 128 }),
  ],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    const files = req.files as { [field: string]: Express.Multer.File[] } | undefined;
    const photo = files?.photo?.[0];
    if (!photo) { res.status(400).json({ error: 'No file uploaded (field name "photo")' }); return; }
    const thumb = files?.thumb?.[0];
    res.status(201).json(await uploadScanPhoto({
      tenantId: req.user!.tenantId,
      campaignId: req.params.id,
      scanRef: req.params.scanRef,
      actorId: req.user!.sub,
      buffer: photo.buffer,
      mimeType: photo.mimetype,
      thumbBuffer: thumb?.buffer,
      thumbMimeType: thumb?.mimetype,
      photoType: req.body.photoType,
      latitude: req.body.latitude,
      longitude: req.body.longitude,
      geoAccuracyMeters: req.body.geoAccuracyMeters,
      capturedAt: req.body.capturedAt,
      deviceId: req.body.deviceId,
    }));
  }),
);

auditPhotosRouter.get('/:id/photos', requireAnyPermission('audit:read', 'audit:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const locationId = typeof req.query.locationId === 'string' ? req.query.locationId : undefined;
    res.json(await listCampaignPhotos(req.user!.tenantId, req.params.id, locationId));
  }),
);
