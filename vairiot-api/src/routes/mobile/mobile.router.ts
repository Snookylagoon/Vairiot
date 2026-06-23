import { Router, Request, Response } from 'express';
import { Readable } from 'stream';
import { prisma } from '../../lib/prisma';
import { minioClient, MOBILE_RELEASES_BUCKET } from '../../lib/minio';
import { asyncHandler } from '../../middleware/error-handler';

// Public router — the mobile app polls these endpoints with no auth so it can
// check for updates even before the user logs in.
export const mobileRouter = Router();

mobileRouter.get('/version', asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const release = await prisma.mobileRelease.findFirst({
    where: { isCurrent: true },
    orderBy: { versionCode: 'desc' },
  });
  if (!release) {
    res.json({ available: false });
    return;
  }
  res.json({
    available: true,
    versionCode:  release.versionCode,
    versionName:  release.versionName,
    sha256:       release.sha256,
    sizeBytes:    release.sizeBytes,
    mandatory:    release.mandatory,
    releaseNotes: release.releaseNotes,
    apkUrl:       '/api/v1/mobile/latest.apk',
  });
}));

mobileRouter.get('/latest.apk', asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const release = await prisma.mobileRelease.findFirst({
    where: { isCurrent: true },
    orderBy: { versionCode: 'desc' },
  });
  if (!release) { res.status(404).json({ error: 'No release available' }); return; }
  const stream = await minioClient.getObject(MOBILE_RELEASES_BUCKET, release.storageKey);
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', `attachment; filename="vairiot-${release.versionName}.apk"`);
  res.setHeader('Content-Length', String(release.sizeBytes));
  res.setHeader('X-Vairiot-SHA256', release.sha256);
  res.setHeader('X-Vairiot-VersionCode', String(release.versionCode));
  res.setHeader('X-Vairiot-VersionName', release.versionName);
  (stream as InstanceType<typeof Readable>).pipe(res);
}));
