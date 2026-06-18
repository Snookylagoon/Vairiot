import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authenticate, requirePermission } from '../../middleware/authenticate';
import { listDocuments, uploadDocument, getDocumentStream, deleteDocument } from '../../services/document.service';

export const documentsRouter = Router();
documentsRouter.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

documentsRouter.get('/assets/:assetId/documents', async (req: Request, res: Response): Promise<void> => {
  try { res.json(await listDocuments(req.user!.tenantId, req.params.assetId)); }
  catch { res.status(500).json({ error: 'Failed to list documents' }); }
});

documentsRouter.post(
  '/assets/:assetId/documents',
  requirePermission('asset:write'),
  upload.single('document'),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) { res.status(400).json({ error: 'No file uploaded (field name "document")' }); return; }
    try {
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
    } catch (e) {
      if (e instanceof Error && e.message === 'ASSET_NOT_FOUND') { res.status(404).json({ error: 'Asset not found' }); return; }
      res.status(500).json({ error: 'Failed to upload document' });
    }
  },
);

documentsRouter.get('/documents/:id/download', async (req: Request, res: Response): Promise<void> => {
  try {
    const { stream, mimeType, fileName } = await getDocumentStream(req.user!.tenantId, req.params.id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    stream.pipe(res);
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') { res.status(404).json({ error: 'Document not found' }); return; }
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

documentsRouter.delete('/documents/:id', requirePermission('asset:delete'), async (req: Request, res: Response): Promise<void> => {
  try { res.json(await deleteDocument(req.user!.tenantId, req.params.id)); }
  catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') { res.status(404).json({ error: 'Document not found' }); return; }
    res.status(500).json({ error: 'Failed to delete document' });
  }
});
