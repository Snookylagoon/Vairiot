import { Router, Request, Response } from 'express';
import multer from 'multer';
import { requireAnyPermission } from '../../middleware/authorise';
import { asyncHandler } from '../../middleware/error-handler';
import { listDocuments, uploadDocument, getDocumentStream, deleteDocument } from '../../services/document.service';

export const documentsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

documentsRouter.get('/assets/:assetId/documents',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await listDocuments(req.user!.tenantId, req.params.assetId));
  }),
);

documentsRouter.post('/assets/:assetId/documents',
  requireAnyPermission('asset:write'),
  upload.single('document'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.file) { res.status(400).json({ error: 'No file uploaded (field name "document")' }); return; }
    const doc = await uploadDocument({
      tenantId: req.user!.tenantId,
      assetId: req.params.assetId,
      actorId: req.user!.sub,
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      fileName: req.file.originalname,
      documentType: req.body.documentType ?? 'other',
      notes: req.body.notes,
    });
    res.status(201).json(doc);
  }),
);

documentsRouter.get('/documents/:id/download',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { stream, mimeType, fileName } = await getDocumentStream(req.user!.tenantId, req.params.id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    stream.pipe(res);
  }),
);

documentsRouter.delete('/documents/:id', requireAnyPermission('asset:delete'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await deleteDocument(req.user!.tenantId, req.params.id));
  }),
);
