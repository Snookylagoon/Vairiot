import type { Readable } from 'stream';

import { logger } from '../logger';

import { stripHeic } from './heic';
import { stripJpeg } from './jpeg';
import { stripPng, stripWebp } from './png-webp';

// Images keep their originals in storage (they can be evidence), but every
// copy that leaves the API, whether downloaded, shared or embedded in an
// export, has its EXIF/GPS and other metadata removed first (KFR-043).

type Stripper = (buf: Buffer) => Buffer | null;

const BY_MIME: Record<string, Stripper> = {
  'image/jpeg': stripJpeg,
  'image/jpg': stripJpeg,
  'image/pjpeg': stripJpeg,
  'image/png': stripPng,
  'image/webp': stripWebp,
  'image/heic': stripHeic,
  'image/heif': stripHeic,
};

/** Picks a stripper by the file's own signature, falling back to the stated type. */
function stripperFor(buf: Buffer, mimeType: string): Stripper | undefined {
  if (buf[0] === 0xff && buf[1] === 0xd8) return stripJpeg;
  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return stripPng;
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return stripWebp;
  if (buf.toString('latin1', 4, 8) === 'ftyp') return stripHeic;
  return BY_MIME[mimeType.toLowerCase()];
}

/**
 * Returns the image without metadata. Non-image types pass through unchanged.
 * An image that cannot be parsed is refused rather than sent with its metadata.
 */
export function stripImageMetadata(buf: Buffer, mimeType: string): Buffer {
  if (!mimeType.toLowerCase().startsWith('image/')) return buf;
  const strip = stripperFor(buf, mimeType);
  if (!strip) return buf;  // e.g. SVG or GIF: no EXIF container
  const out = strip(buf);
  if (!out) throw new Error(`Could not remove metadata from a ${mimeType} file`);
  return out;
}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/** Reads a stored object and strips it. Uploads are capped (10 MB photos, 25 MB documents). */
export async function readStrippedImage(stream: Readable, mimeType: string): Promise<Buffer> {
  const buf = await readAll(stream);
  try {
    return stripImageMetadata(buf, mimeType);
  } catch (e) {
    logger.warn('Image metadata strip failed', { mimeType, error: (e as Error).message });
    throw e;
  }
}
