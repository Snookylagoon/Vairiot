import { minioClient, MOBILE_RELEASES_BUCKET } from './minio';
import { prisma } from './prisma';

/** Only this many iOS releases are kept downloadable; older ones are pruned after each upload. */
export const IOS_RELEASE_RETENTION_COUNT = 3;

/**
 * Deletes iOS releases beyond the most recent IOS_RELEASE_RETENTION_COUNT (by
 * versionCode), removing both the DB row and its MinIO blob. The current
 * release is never pruned, even if it somehow falls outside that window.
 */
export async function pruneOldIosReleases(): Promise<void> {
  const releases = await prisma.iosRelease.findMany({
    orderBy: { versionCode: 'desc' },
    select: { id: true, storageKey: true, isCurrent: true },
  });

  const toDelete = releases.slice(IOS_RELEASE_RETENTION_COUNT).filter((r) => !r.isCurrent);
  for (const release of toDelete) {
    await minioClient.removeObject(MOBILE_RELEASES_BUCKET, release.storageKey).catch(() => {});
    await prisma.iosRelease.delete({ where: { id: release.id } });
  }
}
