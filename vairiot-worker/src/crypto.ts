import { createDecipheriv, scryptSync } from 'crypto';

const ALGO = 'aes-256-gcm';
const SALT = 'vairiot-smtp-v1';

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.APP_ENCRYPTION_KEY;
  if (!secret || secret.length < 16) {
    throw new Error('APP_ENCRYPTION_KEY must be set (>=16 chars) for SMTP secret decryption.');
  }
  cachedKey = scryptSync(secret, SALT, 32);
  return cachedKey;
}

export function decryptSecret(payload: string): string {
  const [ver, ivB64, tagB64, encB64] = payload.split(':');
  if (ver !== 'v1') throw new Error(`Unknown ciphertext version: ${ver}`);
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const enc = Buffer.from(encB64, 'base64');
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
