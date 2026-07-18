import { Router, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { requireRole } from '../../middleware/authorise';
import { asyncHandler } from '../../middleware/error-handler';
import { prisma } from '../../lib/prisma';
import { minioClient, MOBILE_RELEASES_BUCKET } from '../../lib/minio';
import { pruneOldIosReleases } from '../../lib/iosReleaseRetention';

export const iosReleasesRouter = Router();

// Platform-admin only.
iosReleasesRouter.use(requireRole('Platform Super Admin'));

const ipaUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 300 * 1024 * 1024 }, // 300 MB
  fileFilter: (_req, file, cb) => {
    const ok = file.originalname.toLowerCase().endsWith('.ipa');
    if (!ok) { cb(new Error('UNSUPPORTED_MEDIA')); return; }
    cb(null, true);
  },
});

function parseVersionFromBody(req: Request): { versionCode?: number; versionName?: string } {
  const vc = Number(req.body?.versionCode);
  const vn = typeof req.body?.versionName === 'string' ? req.body.versionName.trim() : '';
  return {
    versionCode: Number.isInteger(vc) && vc > 0 ? vc : undefined,
    versionName: vn || undefined,
  };
}

// ── Devices (UDIDs captured by the public enrollment helper) ─────────────────
// Registered BEFORE /:id routes so "devices" isn't swallowed as an id.

iosReleasesRouter.get('/devices', asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const devices = await prisma.iosDevice.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(devices);
}));

iosReleasesRouter.patch('/devices/:id', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { name, registered } = req.body ?? {};
  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = typeof name === 'string' ? name.trim() || null : null;
  if (typeof registered === 'boolean') data.registered = registered;
  const updated = await prisma.iosDevice.update({ where: { id: req.params.id }, data });
  res.json(updated);
}));

iosReleasesRouter.delete('/devices/:id', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  await prisma.iosDevice.delete({ where: { id: req.params.id } });
  res.json({ message: 'Device deleted' });
}));

// ── Releases ─────────────────────────────────────────────────────────────────

iosReleasesRouter.get('/', asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const releases = await prisma.iosRelease.findMany({
    orderBy: { versionCode: 'desc' },
  });
  res.json(releases);
}));

iosReleasesRouter.post('/', ipaUpload.single('ipa'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.file) { res.status(400).json({ error: 'No file uploaded (field name "ipa")' }); return; }

    const { versionCode, versionName } = parseVersionFromBody(req);
    if (!versionCode || !versionName) {
      res.status(400).json({ error: 'versionCode (int) and versionName (string) are required form fields' });
      return;
    }

    const existing = await prisma.iosRelease.findUnique({ where: { versionCode } });
    if (existing) {
      res.status(409).json({ error: `versionCode ${versionCode} already exists` });
      return;
    }

    const sha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const storageKey = `ios/${versionCode}-${Date.now()}.ipa`;
    await minioClient.putObject(
      MOBILE_RELEASES_BUCKET,
      storageKey,
      req.file.buffer,
      req.file.buffer.length,
      { 'Content-Type': 'application/octet-stream' },
    );

    const setCurrent = req.body?.setCurrent !== 'false';
    const releaseNotes = typeof req.body?.releaseNotes === 'string' ? req.body.releaseNotes.trim() || null : null;

    const release = await prisma.$transaction(async (tx) => {
      if (setCurrent) {
        await tx.iosRelease.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
      }
      return tx.iosRelease.create({
        data: {
          versionCode,
          versionName,
          storageKey,
          sizeBytes: req.file!.buffer.length,
          sha256,
          releaseNotes,
          isCurrent: setCurrent,
          uploadedByUserId: req.user!.sub,
        },
      });
    });

    await pruneOldIosReleases();

    res.status(201).json(release);
  }),
);

iosReleasesRouter.get('/:id/download', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const release = await prisma.iosRelease.findUnique({ where: { id: req.params.id } });
  if (!release) { res.status(404).json({ error: 'Release not found' }); return; }
  const stream = await minioClient.getObject(MOBILE_RELEASES_BUCKET, release.storageKey);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="vairiot-${release.versionName}.ipa"`);
  res.setHeader('Content-Length', String(release.sizeBytes));
  res.setHeader('X-Vairiot-SHA256', release.sha256);
  res.setHeader('X-Vairiot-VersionCode', String(release.versionCode));
  res.setHeader('X-Vairiot-VersionName', release.versionName);
  stream.pipe(res);
}));

iosReleasesRouter.patch('/:id', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { isCurrent, releaseNotes } = req.body ?? {};
  const data: Record<string, unknown> = {};
  if (releaseNotes !== undefined) data.releaseNotes = releaseNotes?.trim() || null;

  const updated = await prisma.$transaction(async (tx) => {
    if (isCurrent === true) {
      await tx.iosRelease.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
      data.isCurrent = true;
    } else if (isCurrent === false) {
      data.isCurrent = false;
    }
    return tx.iosRelease.update({ where: { id: req.params.id }, data });
  });
  res.json(updated);
}));

iosReleasesRouter.delete('/:id', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const release = await prisma.iosRelease.findUnique({ where: { id: req.params.id } });
  if (!release) { res.status(404).json({ error: 'Release not found' }); return; }
  await minioClient.removeObject(MOBILE_RELEASES_BUCKET, release.storageKey).catch(() => {});
  await prisma.iosRelease.delete({ where: { id: req.params.id } });
  res.json({ message: 'Release deleted' });
}));
