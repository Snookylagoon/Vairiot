import { execFile } from 'node:child_process';

/**
 * iOS "Profile Service" enrolment payloads (POST /api/v1/ios/udid/callback).
 *
 * The device sends its attributes as a plist inside a PKCS#7 (CMS) envelope
 * signed by its Apple-issued device certificate. The endpoint is public, so
 * anything it stores is attacker-controlled unless the signature checks out.
 *
 * Verification runs `openssl cms -verify` against the CA bundle named by
 * IOS_UDID_CA_FILE (Apple's root plus the iPhone device CA chain). When the
 * variable is unset the payload is accepted unverified and the device is
 * stored with signatureVerified = false; set it once a real enrolment has been
 * confirmed to verify (DEPLOY.md), after which unverified payloads are refused.
 */

export type EnrolmentCheck =
  | { verified: true; content: string }
  | { verified: false; enforced: boolean; reason: string; content: string };

export async function verifyEnrolmentPayload(
  body: Buffer,
  caFile: string | undefined = process.env.IOS_UDID_CA_FILE,
): Promise<EnrolmentCheck> {
  if (!caFile) {
    return { verified: false, enforced: false, reason: 'IOS_UDID_CA_FILE not set', content: body.toString('latin1') };
  }
  try {
    const content = await openssl(
      ['cms', '-verify', '-inform', 'DER', '-binary', '-purpose', 'any', '-CAfile', caFile],
      body,
    );
    return { verified: true, content: content.toString('utf8') };
  } catch (e) {
    return { verified: false, enforced: true, reason: (e as Error).message, content: '' };
  }
}

function openssl(args: string[], input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'openssl',
      args,
      { encoding: 'buffer', timeout: 5_000, maxBuffer: 256 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const detail = stderr.toString('utf8').split('\n').find((l) => l.trim()) ?? error.message;
          reject(new Error(detail.trim().slice(0, 200)));
        } else {
          resolve(stdout);
        }
      },
    );
    child.stdin?.end(input);
  });
}

export interface DeviceAttributes {
  udid: string;
  product: string | null;
  osVersion: string | null;
  serial: string | null;
}

// Apple formats. Anything else is not a real device and is dropped (optional
// fields) or refused (UDID), which also caps what a forged payload can store.
const UDID_RE    = /^(?:[0-9a-f]{40}|[0-9a-f]{8}-[0-9a-f]{16})$/i; // legacy 40-hex, or A12+ 8-16
const PRODUCT_RE = /^[A-Za-z]+\d{1,3},\d{1,3}$/;                    // e.g. iPhone18,2
const VERSION_RE = /^[0-9A-Za-z.]{1,16}$/;                          // OS build, e.g. 23A341
const SERIAL_RE  = /^[0-9A-Za-z]{8,16}$/;

/** Reads the device attributes from the (verified) plist. Null if no valid UDID. */
export function parseDeviceAttributes(plist: string): DeviceAttributes | null {
  const attr = (key: string, re: RegExp): string | null => {
    const m = plist.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]{1,64})</string>`));
    const value = m?.[1].trim();
    return value && re.test(value) ? value : null;
  };
  const udid = attr('UDID', UDID_RE);
  if (!udid) return null;
  return {
    udid,
    product: attr('PRODUCT', PRODUCT_RE),
    osVersion: attr('VERSION', VERSION_RE),
    serial: attr('SERIAL', SERIAL_RE),
  };
}
