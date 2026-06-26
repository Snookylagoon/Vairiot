// One-off OTA release publisher. Mirrors POST /api/admin/mobile-releases.
// Runs INSIDE the vairiot_api container (has minio + prisma + env).
//   node upload-release.cjs <apkPath> <versionCode> <versionName> [releaseNotes]
const fs = require('fs');
const crypto = require('crypto');
const { minioClient, MOBILE_RELEASES_BUCKET } = require('/app/vairiot-api/dist/lib/minio.js');
const { prisma } = require('/app/vairiot-api/dist/lib/prisma.js');

(async () => {
  const [apkPath, versionCodeRaw, versionName, releaseNotes] = process.argv.slice(2);
  const versionCode = Number(versionCodeRaw);
  if (!apkPath || !Number.isInteger(versionCode) || !versionName) {
    throw new Error('usage: node upload-release.cjs <apkPath> <versionCode> <versionName> [releaseNotes]');
  }

  const buffer = fs.readFileSync(apkPath);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  const existing = await prisma.mobileRelease.findUnique({ where: { versionCode } });
  if (existing) throw new Error(`versionCode ${versionCode} already exists (id=${existing.id})`);

  const storageKey = `releases/${versionCode}-${Date.now()}.apk`;
  await minioClient.putObject(
    MOBILE_RELEASES_BUCKET, storageKey, buffer, buffer.length,
    { 'Content-Type': 'application/vnd.android.package-archive' },
  );

  const release = await prisma.$transaction(async (tx) => {
    await tx.mobileRelease.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
    return tx.mobileRelease.create({
      data: {
        versionCode, versionName, storageKey,
        sizeBytes: buffer.length, sha256,
        releaseNotes: releaseNotes?.trim() || null,
        mandatory: false, isCurrent: true,
      },
    });
  });

  console.log(JSON.stringify({ ok: true, id: release.id, versionCode, versionName, sha256, sizeBytes: buffer.length, storageKey }, null, 2));
  await prisma.$disconnect();
})().catch(async (e) => { console.error('FAILED:', e.message); try { await prisma.$disconnect(); } catch {} process.exit(1); });
