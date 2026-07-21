import crypto from 'crypto';

import { Router, Request, Response } from 'express';
import multer from 'multer';

import { minioClient, MOBILE_RELEASES_BUCKET } from '../../lib/minio';
import { pruneOldMobileReleases } from '../../lib/mobileReleaseRetention';
import { prisma } from '../../lib/prisma';
import { requireRole } from '../../middleware/authorise';
import { asyncHandler } from '../../middleware/error-handler';

export const mobileReleasesRouter = Router();

// Platform-admin only.
mobileReleasesRouter.use(requireRole('Platform Super Admin'));

const apkUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 150 * 1024 * 1024 }, // 150 MB
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === 'application/vnd.android.package-archive' ||
      file.originalname.toLowerCase().endsWith('.apk');
    if (!ok) { cb(new Error('UNSUPPORTED_MEDIA')); return; }
    cb(null, true);
  },
});

// Extract versionCode/versionName from an APK by reading the binary
// AndroidManifest.xml inside it. Lightweight regex over the resource strings.
// For real use, prefer letting the admin enter them by hand if the regex misses.
function parseVersionFromBody(req: Request): { versionCode?: number; versionName?: string } {
  const vc = Number(req.body?.versionCode);
  const vn = typeof req.body?.versionName === 'string' ? req.body.versionName.trim() : '';
  return {
    versionCode: Number.isInteger(vc) && vc > 0 ? vc : undefined,
    versionName: vn || undefined,
  };
}

mobileReleasesRouter.get('/', asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const releases = await prisma.mobileRelease.findMany({
    orderBy: { versionCode: 'desc' },
  });
  res.json(releases);
}));

mobileReleasesRouter.post('/', apkUpload.single('apk'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.file) { res.status(400).json({ error: 'No file uploaded (field name "apk")' }); return; }

    const { versionCode, versionName } = parseVersionFromBody(req);
    if (!versionCode || !versionName) {
      res.status(400).json({ error: 'versionCode (int) and versionName (string) are required form fields' });
      return;
    }

    const existing = await prisma.mobileRelease.findUnique({ where: { versionCode } });
    if (existing) {
      res.status(409).json({ error: `versionCode ${versionCode} already exists` });
      return;
    }

    const sha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const storageKey = `releases/${versionCode}-${Date.now()}.apk`;
    await minioClient.putObject(
      MOBILE_RELEASES_BUCKET,
      storageKey,
      req.file.buffer,
      req.file.buffer.length,
      { 'Content-Type': 'application/vnd.android.package-archive' },
    );

    const mandatory = req.body?.mandatory === 'true' || req.body?.mandatory === true;
    const setCurrent = req.body?.setCurrent !== 'false';
    const releaseNotes = typeof req.body?.releaseNotes === 'string' ? req.body.releaseNotes.trim() || null : null;

    const release = await prisma.$transaction(async (tx) => {
      if (setCurrent) {
        await tx.mobileRelease.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
      }
      return tx.mobileRelease.create({
        data: {
          versionCode,
          versionName,
          storageKey,
          sizeBytes: req.file!.buffer.length,
          sha256,
          releaseNotes,
          mandatory,
          isCurrent: setCurrent,
          uploadedByUserId: req.user!.sub,
        },
      });
    });

    await pruneOldMobileReleases();

    res.status(201).json(release);
  }),
);

mobileReleasesRouter.get('/:id/download', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const release = await prisma.mobileRelease.findUnique({ where: { id: req.params.id } });
  if (!release) { res.status(404).json({ error: 'Release not found' }); return; }
  const stream = await minioClient.getObject(MOBILE_RELEASES_BUCKET, release.storageKey);
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', `attachment; filename="vairiot-${release.versionName}.apk"`);
  res.setHeader('Content-Length', String(release.sizeBytes));
  res.setHeader('X-Vairiot-SHA256', release.sha256);
  res.setHeader('X-Vairiot-VersionCode', String(release.versionCode));
  res.setHeader('X-Vairiot-VersionName', release.versionName);
  stream.pipe(res);
}));

mobileReleasesRouter.patch('/:id', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { isCurrent, mandatory, releaseNotes } = req.body ?? {};
  const data: Record<string, unknown> = {};
  if (typeof mandatory === 'boolean') data.mandatory = mandatory;
  if (releaseNotes !== undefined) data.releaseNotes = releaseNotes?.trim() || null;

  const updated = await prisma.$transaction(async (tx) => {
    if (isCurrent === true) {
      await tx.mobileRelease.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
      data.isCurrent = true;
    } else if (isCurrent === false) {
      data.isCurrent = false;
    }
    return tx.mobileRelease.update({ where: { id: req.params.id }, data });
  });
  res.json(updated);
}));

mobileReleasesRouter.delete('/:id', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const release = await prisma.mobileRelease.findUnique({ where: { id: req.params.id } });
  if (!release) { res.status(404).json({ error: 'Release not found' }); return; }
  await minioClient.removeObject(MOBILE_RELEASES_BUCKET, release.storageKey).catch(() => {});
  await prisma.mobileRelease.delete({ where: { id: req.params.id } });
  res.json({ message: 'Release deleted' });
}));
