// Removes metadata chunks from PNG and WebP files without re-encoding (KFR-043).

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// eXIf holds EXIF (GPS included); the text chunks carry XMP, comments and
// camera or software notes; tIME is the last-modified time.
const PNG_DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

/** Returns the PNG without metadata chunks, or null if it is not a readable PNG. */
export function stripPng(buf: Buffer): Buffer | null {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  const out: Buffer[] = [buf.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.subarray(i + 4, i + 8).toString('latin1');
    const end = i + 12 + len;  // length + type + data + CRC
    if (end > buf.length) return null;
    if (!PNG_DROP.has(type)) out.push(buf.subarray(i, end));
    i = end;
    if (type === 'IEND') break;
  }
  return Buffer.concat(out);
}

const VP8X_EXIF = 0x08;
const VP8X_XMP = 0x04;

/** Returns the WebP without EXIF and XMP chunks, or null if it is not a readable WebP. */
export function stripWebp(buf: Buffer): Buffer | null {
  if (buf.length < 12 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WEBP') {
    return null;
  }
  const chunks: Buffer[] = [];
  let i = 12;
  while (i + 8 <= buf.length) {
    const type = buf.toString('latin1', i, i + 4);
    const size = buf.readUInt32LE(i + 4);
    const end = i + 8 + size + (size % 2);  // chunks are padded to an even size
    if (i + 8 + size > buf.length) return null;
    const chunk = Buffer.from(buf.subarray(i, Math.min(end, buf.length)));
    if (type === 'VP8X' && chunk.length > 8) chunk[8] &= ~(VP8X_EXIF | VP8X_XMP);
    if (type !== 'EXIF' && type !== 'XMP ') chunks.push(chunk);
    i = end;
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(body.length + 4, 4);
  header.write('WEBP', 8, 'latin1');
  return Buffer.concat([header, body]);
}
