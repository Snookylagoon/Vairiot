import { Router, Request, Response } from 'express';
import multer from 'multer';

import { requireAnyPermission } from '../../middleware/authorise';
import { asyncHandler } from '../../middleware/error-handler';
import {
  listSubTenants,
  getSubTenant,
  createSubTenant,
  updateSubTenantCompany,
  uploadSubTenantLogo,
  deleteSubTenantLogo,
} from '../../services/sub-tenant.service';

export const subTenantsRouter = Router();

const LOGO_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!LOGO_MIMES.includes(file.mimetype.toLowerCase())) {
      cb(new Error('UNSUPPORTED_MEDIA'));
      return;
    }
    cb(null, true);
  },
});

subTenantsRouter.get('/', requireAnyPermission('company:manage'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await listSubTenants(req.user!.tenantId));
  }),
);

subTenantsRouter.post('/', requireAnyPermission('company:manage'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const sub = await createSubTenant(req.user!.tenantId, req.user!.sub, req.body);
    res.status(201).json(sub);
  }),
);

subTenantsRouter.get('/:id', requireAnyPermission('company:manage'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await getSubTenant(req.user!.tenantId, req.params.id));
  }),
);

subTenantsRouter.patch('/:id/company', requireAnyPermission('company:manage'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await updateSubTenantCompany(req.user!.tenantId, req.params.id, req.user!.sub, req.body));
  }),
);

subTenantsRouter.post('/:id/logo', requireAnyPermission('company:manage'),
  logoUpload.single('logo'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.file) { res.status(400).json({ error: 'No file uploaded (field name "logo")' }); return; }
    const result = await uploadSubTenantLogo(
      req.user!.tenantId,
      req.params.id,
      req.user!.sub,
      { buffer: req.file.buffer, mimetype: req.file.mimetype },
    );
    res.json(result);
  }),
);

subTenantsRouter.delete('/:id/logo', requireAnyPermission('company:manage'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await deleteSubTenantLogo(req.user!.tenantId, req.params.id, req.user!.sub));
  }),
);
