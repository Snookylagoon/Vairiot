import { Router, Request, Response } from 'express';
import multer from 'multer';
import { body, validationResult } from 'express-validator';
import { requireAnyPermission } from '../../middleware/authorise';
import { asyncHandler } from '../../middleware/error-handler';
import {
  listPhotos, uploadPhoto, getPhotoStream, deletePhoto, updatePhoto,
  listMaintenancePhotos, uploadMaintenancePhoto,
} from '../../services/photo.service';

export const photosRouter = Router();

const ACCEPTED_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ACCEPTED_MIMES.includes(file.mimetype.toLowerCase())) {
      cb(new Error('UNSUPPORTED_MEDIA'));
      return;
    }
    cb(null, true);
  },
});

const uploadFields = upload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'thumb', maxCount: 1 },
]);

photosRouter.get('/assets/:assetId/photos',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await listPhotos(req.user!.tenantId, req.params.assetId));
  }),
);

photosRouter.post('/assets/:assetId/photos',
  requireAnyPermission('asset:write'),
  uploadFields,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const files = req.files as { [field: string]: Express.Multer.File[] } | undefined;
    const photoFile = files?.photo?.[0];
    if (!photoFile) { res.status(400).json({ error: 'No file uploaded (field name "photo")' }); return; }
    const thumbFile = files?.thumb?.[0];
    const photo = await uploadPhoto({
      tenantId:      req.user!.tenantId,
      assetId:       req.params.assetId,
      actorId:       req.user!.sub,
      buffer:        photoFile.buffer,
      mimeType:      photoFile.mimetype,
      thumbBuffer:   thumbFile?.buffer,
      thumbMimeType: thumbFile?.mimetype,
    });
    res.status(201).json(photo);
  }),
);

photosRouter.get('/maintenance/:id/photos',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await listMaintenancePhotos(req.user!.tenantId, req.params.id));
  }),
);

photosRouter.post('/maintenance/:id/photos',
  requireAnyPermission('asset:write'),
  uploadFields,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const files = req.files as { [field: string]: Express.Multer.File[] } | undefined;
    const photoFile = files?.photo?.[0];
    if (!photoFile) { res.status(400).json({ error: 'No file uploaded (field name "photo")' }); return; }
    const thumbFile = files?.thumb?.[0];
    const photo = await uploadMaintenancePhoto({
      tenantId:           req.user!.tenantId,
      maintenanceEventId: req.params.id,
      actorId:            req.user!.sub,
      buffer:             photoFile.buffer,
      mimeType:           photoFile.mimetype,
      caption:            typeof req.body?.caption === 'string' ? req.body.caption : undefined,
      thumbBuffer:        thumbFile?.buffer,
      thumbMimeType:      thumbFile?.mimetype,
    });
    res.status(201).json(photo);
  }),
);

photosRouter.get('/photos/:id/download',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const thumb = req.query.thumb === '1';
    const { stream, mimeType } = await getPhotoStream(req.user!.tenantId, req.params.id, thumb);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    stream.pipe(res);
  }),
);

photosRouter.patch('/photos/:id',
  requireAnyPermission('asset:write'),
  [body('caption').optional({ nullable: true }).isString().isLength({ max: 500 })],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    res.json(await updatePhoto(req.user!.tenantId, req.params.id, { caption: req.body.caption }));
  }),
);

photosRouter.delete('/photos/:id', requireAnyPermission('asset:delete'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await deletePhoto(req.user!.tenantId, req.params.id));
  }),
);
