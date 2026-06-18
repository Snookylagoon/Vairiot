import { Router, Request, Response } from 'express';
import multer from 'multer';
import { body, validationResult } from 'express-validator';
import { authenticate, requireAnyPermission } from '../../middleware/authenticate';
import { asyncHandler } from '../../middleware/error-handler';
import { listPhotos, uploadPhoto, getPhotoStream, deletePhoto, updatePhoto } from '../../services/photo.service';

export const photosRouter = Router();
photosRouter.use(authenticate);

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

photosRouter.get('/assets/:assetId/photos',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await listPhotos(req.user!.tenantId, req.params.assetId));
  }),
);

photosRouter.post('/assets/:assetId/photos',
  requireAnyPermission('asset:write'),
  upload.single('photo'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.file) { res.status(400).json({ error: 'No file uploaded (field name "photo")' }); return; }
    const photo = await uploadPhoto({
      tenantId: req.user!.tenantId,
      assetId:  req.params.assetId,
      actorId:  req.user!.sub,
      buffer:   req.file.buffer,
      mimeType: req.file.mimetype,
    });
    res.status(201).json(photo);
  }),
);

photosRouter.get('/photos/:id/download',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { stream, mimeType } = await getPhotoStream(req.user!.tenantId, req.params.id);
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
