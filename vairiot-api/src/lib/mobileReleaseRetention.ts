import { prisma } from './prisma';
import { minioClient, MOBILE_RELEASES_BUCKET } from './minio';

/** Only this many releases are kept downloadable; older ones are pruned after each upload. */
export const MOBILE_RELEASE_RETENTION_COUNT = 3;

/**
 * Deletes releases beyond the most recent MOBILE_RELEASE_RETENTION_COUNT (by
 * versionCode), removing both the DB row and its MinIO blob. The current
 * release is never pruned, even if it somehow falls outside that window.
 */
export async function pruneOldMobileReleases(): Promise<void> {
  const releases = await prisma.mobileRelease.findMany({
    orderBy: { versionCode: 'desc' },
    select: { id: true, storageKey: true, isCurrent: true },
  });

  const toDelete = releases.slice(MOBILE_RELEASE_RETENTION_COUNT).filter((r) => !r.isCurrent);
  for (const release of toDelete) {
    await minioClient.removeObject(MOBILE_RELEASES_BUCKET, release.storageKey).catch(() => {});
    await prisma.mobileRelease.delete({ where: { id: release.id } });
  }
}
