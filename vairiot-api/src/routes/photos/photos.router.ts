import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authenticate, requirePermission } from '../../middleware/authenticate';
import { listPhotos, uploadPhoto, getPhotoStream, deletePhoto } from '../../services/photo.service';

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

// List photos for an asset
photosRouter.get('/assets/:assetId/photos', async (req: Request, res: Response): Promise<void> => {
  try { res.json(await listPhotos(req.user!.tenantId, req.params.assetId)); }
  catch { res.status(500).json({ error: 'Failed to list photos' }); }
});

// Upload photo for an asset (multipart field: "photo")
photosRouter.post(
  '/assets/:assetId/photos',
  requirePermission('asset:write'),
  upload.single('photo'),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) { res.status(400).json({ error: 'No file uploaded (field name "photo")' }); return; }
    try {
      const photo = await uploadPhoto({
        tenantId: req.user!.tenantId,
        assetId:  req.params.assetId,
        actorId:  req.user!.sub,
        buffer:   req.file.buffer,
        mimeType: req.file.mimetype,
      });
      res.status(201).json(photo);
    } catch (e) {
      if (e instanceof Error && e.message === 'ASSET_NOT_FOUND') { res.status(404).json({ error: 'Asset not found' }); return; }
      res.status(500).json({ error: 'Failed to upload photo' });
    }
  },
);

// Download photo binary
photosRouter.get('/photos/:id/download', async (req: Request, res: Response): Promise<void> => {
  try {
    const { stream, mimeType } = await getPhotoStream(req.user!.tenantId, req.params.id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    stream.pipe(res);
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') { res.status(404).json({ error: 'Photo not found' }); return; }
    res.status(500).json({ error: 'Failed to fetch photo' });
  }
});

// Delete photo
photosRouter.delete('/photos/:id', requirePermission('asset:delete'), async (req: Request, res: Response): Promise<void> => {
  try { res.json(await deletePhoto(req.user!.tenantId, req.params.id)); }
  catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') { res.status(404).json({ error: 'Photo not found' }); return; }
    res.status(500).json({ error: 'Failed to delete photo' });
  }
});
