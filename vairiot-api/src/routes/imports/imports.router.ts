import { timingSafeEqual } from 'node:crypto';

import { Router, type NextFunction, type Response } from 'express';
import multer from 'multer';
import { importMappingSaveSchema, importModeSchema } from 'vairiot-shared';

import { ForbiddenError, UnauthorizedError, ValidationError } from '../../lib/errors';
import { runWithTenant } from '../../lib/tenant-context';
import { requireAnyPermission } from '../../middleware/authorise';
import { asyncHandler } from '../../middleware/error-handler';
import {
  cancelBatch, commitBatch, errorRowsWorkbook, getBatch, listBatches, listMappings, listRows, MAX_BYTES, reconciliationWorkbook,
  saveMapping, setMapping, uploadBatch,
} from '../../services/import/batches.service';
import { commitChunk, commitStart } from '../../services/import/commit.service';
import type { Request } from '../../types/http';

// The staged register import (Phase 2, S2.5, stage 2.13). Creating assets
// needs asset:write; update mode, which changes existing assets' figures,
// also needs accounting:write (D16). Every step answers at once; the worker
// does the work and the batch shows its progress.
export const importsRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES } });
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const mode = (v: unknown) => {
  const r = importModeSchema.safeParse(v ?? 'CREATE');
  if (!r.success) throw new ValidationError('mode: CREATE or UPDATE');
  return r.data;
};
function assertMayUpdate(req: Request, m: 'CREATE' | 'UPDATE') {
  if (m === 'UPDATE' && !req.user!.permissions?.includes('accounting:write')) {
    throw new ForbiddenError('Updating existing assets from a file needs accounting:write (D16)');
  }
}

importsRouter.get('/', requireAnyPermission('asset:read'),
  asyncHandler(async (req: Request, res: Response) => { res.json(await listBatches(req.user!.tenantId)); }));

importsRouter.post('/', requireAnyPermission('asset:write'), (req, res, next) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') { next(new ValidationError('The file is larger than 25 MB')); return; }
    next(err);
  });
}, asyncHandler(async (req: Request, res: Response) => {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) throw new ValidationError('Attach the file as "file"');
  const m = mode(req.body.mode);
  assertMayUpdate(req, m);
  res.status(202).json(await uploadBatch(req.user!.tenantId, req.user!.sub, file, m));
}));

importsRouter.get('/mappings', requireAnyPermission('asset:read'),
  asyncHandler(async (req: Request, res: Response) => { res.json(await listMappings(req.user!.tenantId)); }));

importsRouter.put('/mappings', requireAnyPermission('asset:write'),
  asyncHandler(async (req: Request, res: Response) => {
    const r = importMappingSaveSchema.safeParse(req.body);
    if (!r.success) throw new ValidationError('A name and a valid mapping are needed');
    res.json(await saveMapping(req.user!.tenantId, req.user!.sub, r.data.name, r.data.mapping));
  }));

importsRouter.get('/:id', requireAnyPermission('asset:read'),
  asyncHandler(async (req: Request, res: Response) => { res.json(await getBatch(req.user!.tenantId, req.params.id)); }));

importsRouter.get('/:id/rows', requireAnyPermission('asset:read'),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await listRows(req.user!.tenantId, req.params.id, { status: req.query.status as string, page: Number(req.query.page) || 1, pageSize: Number(req.query.pageSize) || 100 }));
  }));

importsRouter.put('/:id/mapping', requireAnyPermission('asset:write'),
  asyncHandler(async (req: Request, res: Response) => {
    const m = req.body.mode === undefined ? undefined : mode(req.body.mode);
    if (m) assertMayUpdate(req, m);
    res.status(202).json(await setMapping(req.user!.tenantId, req.user!.sub, req.params.id, { mapping: req.body.mapping, profile: req.body.profile, mode: m }));
  }));

importsRouter.post('/:id/commit', requireAnyPermission('asset:write'),
  asyncHandler(async (req: Request, res: Response) => {
    assertMayUpdate(req, (await getBatch(req.user!.tenantId, req.params.id)).mode);
    res.status(202).json(await commitBatch(req.user!.tenantId, req.user!.sub, req.params.id));
  }));

importsRouter.post('/:id/cancel', requireAnyPermission('asset:write'),
  asyncHandler(async (req: Request, res: Response) => { res.json(await cancelBatch(req.user!.tenantId, req.user!.sub, req.params.id)); }));

importsRouter.get('/:id/errors.xlsx', requireAnyPermission('asset:read'),
  asyncHandler(async (req: Request, res: Response) => {
    res.type(XLSX).attachment(`import-${req.params.id}-rows-to-fix.xlsx`).send(await errorRowsWorkbook(req.user!.tenantId, req.params.id));
  }));

importsRouter.get('/:id/reconciliation.xlsx', requireAnyPermission('asset:read'),
  asyncHandler(async (req: Request, res: Response) => {
    res.type(XLSX).attachment(`import-${req.params.id}-reconciliation.xlsx`).send(await reconciliationWorkbook(req.user!.tenantId, req.params.id));
  }));

// ── Internal: the worker's commit (not behind nginx) ─────────────────────────

/** The worker's shared secret; with none configured the endpoints stay shut. */
function requireInternalToken(req: Request, _res: Response, next: NextFunction) {
  const expected = process.env.INTERNAL_API_TOKEN ?? '';
  const given = String(req.headers['x-internal-token'] ?? '');
  const ok = expected.length >= 32 && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) { next(new UnauthorizedError('Not an internal caller')); return; }
  const tenantId = typeof req.body?.tenantId === 'string' ? req.body.tenantId : '';
  if (!tenantId) { next(new ValidationError('tenantId is required')); return; }
  runWithTenant(tenantId, next);
}

export const internalImportsRouter = Router();
internalImportsRouter.use(requireInternalToken);

internalImportsRouter.post('/:id/commit-start',
  asyncHandler(async (req: Request, res: Response) => { res.json(await commitStart(req.body.tenantId, req.params.id)); }));

internalImportsRouter.post('/:id/commit-chunk',
  asyncHandler(async (req: Request, res: Response) => { res.json(await commitChunk(req.body.tenantId, req.params.id, req.body.rowIds)); }));
