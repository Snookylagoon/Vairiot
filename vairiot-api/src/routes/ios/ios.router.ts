import { Readable } from 'stream';

import express, { Router, Request, Response } from 'express';

import { minioClient, MOBILE_RELEASES_BUCKET } from '../../lib/minio';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../middleware/error-handler';

// Public router — Ad Hoc over-the-air install for iOS. Safari on the device
// hits these endpoints with no auth: the install page, the itms-services
// manifest, the signed IPA, and the UDID-enrollment helper.
export const iosRouter = Router();

const IOS_BUNDLE_ID = 'com.vairiot.mobile';
const IOS_APP_TITLE = 'Vairiot';

// Behind nginx `trust proxy` is set, so req.protocol honours X-Forwarded-Proto.
function baseUrl(req: Request): string {
  return `${req.protocol}://${req.get('host')}`;
}

function currentRelease() {
  return prisma.iosRelease.findFirst({
    where: { isCurrent: true },
    orderBy: { versionCode: 'desc' },
  });
}

const PAGE_STYLE = `
  body { font-family: -apple-system, system-ui, sans-serif; margin: 0; background: #f8f7fb; color: #2b2b33; }
  .hero { background: linear-gradient(90deg, #e83e8c, #9b5de5, #6d28d9); color: #fff; padding: 28px 20px; }
  .hero h1 { margin: 0; font-size: 22px; letter-spacing: 1px; }
  .hero p { margin: 6px 0 0; opacity: .85; font-size: 14px; }
  .wrap { max-width: 560px; margin: 0 auto; padding: 20px; }
  .card { background: #fff; border-radius: 14px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  .btn { display: block; text-align: center; background: #6d28d9; color: #fff; text-decoration: none;
         padding: 14px; border-radius: 12px; font-weight: 600; font-size: 17px; }
  .btn.secondary { background: #eee9fb; color: #6d28d9; }
  .muted { color: #777; font-size: 13px; line-height: 1.5; }
  ol { padding-left: 20px; line-height: 1.7; font-size: 15px; }
  code { background: #f1eef9; padding: 2px 6px; border-radius: 6px; font-size: 13px; word-break: break-all; }
  .udid { font-family: ui-monospace, monospace; font-size: 15px; background: #f1eef9; padding: 12px;
          border-radius: 10px; word-break: break-all; text-align: center; }
`;

function page(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>${PAGE_STYLE}</style>
</head>
<body>
  <div class="hero"><h1>VAIRIOT</h1><p>${title}</p></div>
  <div class="wrap">${body}</div>
</body>
</html>`;
}

// ── Version / binary / manifest ──────────────────────────────────────────────

iosRouter.get('/version', asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const release = await currentRelease();
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
    releaseNotes: release.releaseNotes,
    ipaUrl:       '/api/v1/ios/latest.ipa',
    manifestUrl:  '/api/v1/ios/manifest.plist',
    installUrl:   '/api/v1/ios/install',
  });
}));

iosRouter.get('/latest.ipa', asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const release = await currentRelease();
  if (!release) { res.status(404).json({ error: 'No release available' }); return; }
  const stream = await minioClient.getObject(MOBILE_RELEASES_BUCKET, release.storageKey);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="vairiot-${release.versionName}.ipa"`);
  res.setHeader('Content-Length', String(release.sizeBytes));
  res.setHeader('X-Vairiot-SHA256', release.sha256);
  res.setHeader('X-Vairiot-VersionCode', String(release.versionCode));
  res.setHeader('X-Vairiot-VersionName', release.versionName);
  (stream as InstanceType<typeof Readable>).pipe(res);
}));

// itms-services manifest — must be reachable over HTTPS for iOS to accept it.
iosRouter.get('/manifest.plist', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const release = await currentRelease();
  if (!release) { res.status(404).json({ error: 'No release available' }); return; }
  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>items</key>
  <array>
    <dict>
      <key>assets</key>
      <array>
        <dict>
          <key>kind</key><string>software-package</string>
          <key>url</key><string>${baseUrl(req)}/api/v1/ios/latest.ipa</string>
        </dict>
      </array>
      <key>metadata</key>
      <dict>
        <key>bundle-identifier</key><string>${IOS_BUNDLE_ID}</string>
        <key>bundle-version</key><string>${release.versionName}</string>
        <key>kind</key><string>software</string>
        <key>title</key><string>${IOS_APP_TITLE}</string>
      </dict>
    </dict>
  </array>
</dict>
</plist>`;
  res.setHeader('Content-Type', 'application/xml');
  res.send(manifest);
}));

// ── Install page ─────────────────────────────────────────────────────────────

iosRouter.get('/install', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const release = await currentRelease();
  if (!release) {
    res.status(404).send(page('Install Vairiot', `
      <div class="card"><p>No iOS release has been published yet. Check back soon.</p></div>`));
    return;
  }
  const itms = `itms-services://?action=download-manifest&url=${encodeURIComponent(`${baseUrl(req)}/api/v1/ios/manifest.plist`)}`;
  res.send(page('Install Vairiot on iPhone', `
    <div class="card">
      <p style="margin-top:0"><strong>Version ${release.versionName}</strong> (build ${release.versionCode})</p>
      ${release.releaseNotes ? `<p class="muted">${release.releaseNotes}</p>` : ''}
      <a class="btn" href="${itms}">Install Vairiot</a>
      <p class="muted" style="margin-bottom:0">Tap the button, then choose <strong>Install</strong> when iOS asks.
      The icon appears on your home screen and downloads in the background.</p>
    </div>
    <div class="card">
      <p style="margin-top:0"><strong>Nothing happens when you tap Install?</strong></p>
      <ol style="margin:0">
        <li>Make sure you opened this page in <strong>Safari</strong> (not Chrome or an in-app browser).</li>
        <li>Your device must be authorised first — if it isn't yet, enrol below and we'll add it.</li>
      </ol>
    </div>
    <div class="card">
      <p style="margin-top:0"><strong>First time on this device?</strong></p>
      <p class="muted">We need to authorise your iPhone once before installs will work.</p>
      <a class="btn secondary" href="/api/v1/ios/udid">Enrol this device</a>
    </div>`));
}));

// ── UDID enrollment helper ───────────────────────────────────────────────────
// Classic "profile service" flow: the device installs a temporary configuration
// profile, iOS POSTs its device attributes (UDID etc.) to the callback, and we
// redirect the user to a confirmation page. Nothing persists on the device.

iosRouter.get('/udid', (_req: Request, res: Response): void => {
  res.send(page('Enrol this iPhone', `
    <div class="card">
      <p style="margin-top:0">To authorise this iPhone for Vairiot installs we need its device identifier (UDID).
      This takes about 30 seconds:</p>
      <ol>
        <li>Tap <strong>Get my UDID</strong> below and choose <strong>Allow</strong> when Safari asks to download a configuration profile.</li>
        <li>Open <strong>Settings</strong> — you'll see <strong>Profile Downloaded</strong> at the top. Tap it, then tap <strong>Install</strong>.</li>
        <li>Safari will reopen with a confirmation — your device is then queued for authorisation.</li>
      </ol>
      <a class="btn" href="/api/v1/ios/udid/profile">Get my UDID</a>
      <p class="muted" style="margin-bottom:0">The profile only reads the device identifier and removes itself.
      It does not install anything or grant any access. You can also delete it afterwards under
      Settings &gt; General &gt; VPN &amp; Device Management.</p>
    </div>`));
});

iosRouter.get('/udid/profile', (req: Request, res: Response): void => {
  const profile = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <dict>
    <key>URL</key><string>${baseUrl(req)}/api/v1/ios/udid/callback</string>
    <key>DeviceAttributes</key>
    <array>
      <string>UDID</string>
      <string>PRODUCT</string>
      <string>VERSION</string>
      <string>SERIAL</string>
    </array>
  </dict>
  <key>PayloadOrganization</key><string>Vairiot</string>
  <key>PayloadDisplayName</key><string>Vairiot Device Enrollment</string>
  <key>PayloadDescription</key><string>Sends this device's identifier (UDID) to Vairiot so it can be authorised for app installs. Installs nothing and removes itself.</string>
  <key>PayloadVersion</key><integer>1</integer>
  <key>PayloadUUID</key><string>B1A6E9C0-5F9D-4A3E-9C1F-2D7A44E01A57</string>
  <key>PayloadIdentifier</key><string>com.vairiot.udid</string>
  <key>PayloadType</key><string>Profile Service</string>
</dict>
</plist>`;
  res.setHeader('Content-Type', 'application/x-apple-aspen-config');
  res.setHeader('Content-Disposition', 'attachment; filename="vairiot-enrol.mobileconfig"');
  res.send(profile);
});

// iOS POSTs a PKCS#7-signed plist (Content-Type application/pkcs7-signature).
// The embedded XML is plain enough to extract the attributes without verifying
// the signature — we only use the UDID to queue the device for authorisation.
iosRouter.post(
  '/udid/callback',
  express.raw({ type: () => true, limit: '2mb' }),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const body = Buffer.isBuffer(req.body) ? req.body.toString('latin1') : String(req.body ?? '');
    const attr = (key: string): string | null => {
      const m = body.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`));
      return m ? m[1] : null;
    };
    const udid = attr('UDID');
    if (!udid) { res.status(400).json({ error: 'No UDID in payload' }); return; }

    await prisma.iosDevice.upsert({
      where:  { udid },
      update: { product: attr('PRODUCT'), osVersion: attr('VERSION'), serial: attr('SERIAL') },
      create: { udid, product: attr('PRODUCT'), osVersion: attr('VERSION'), serial: attr('SERIAL') },
    });

    // The profile-service flow expects a 301 — Safari opens the Location URL.
    res.redirect(301, `${baseUrl(req)}/api/v1/ios/udid/done?udid=${encodeURIComponent(udid)}`);
  }),
);

iosRouter.get('/udid/done', (req: Request, res: Response): void => {
  const udid = typeof req.query.udid === 'string' ? req.query.udid.replace(/[^A-Za-z0-9-]/g, '') : '';
  res.send(page('Device enrolled', `
    <div class="card">
      <p style="margin-top:0"><strong>Done — your iPhone is queued for authorisation.</strong></p>
      <p class="muted">Your device identifier has been recorded:</p>
      <div class="udid">${udid || 'recorded'}</div>
      <p class="muted">An administrator now authorises the device with Apple (this is a manual step on their side).
      Once that's done and a new build is published, come back and install:</p>
      <a class="btn secondary" href="/api/v1/ios/install">Go to install page</a>
    </div>`));
});
