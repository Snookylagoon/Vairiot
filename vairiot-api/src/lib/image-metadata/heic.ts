// Blanks the EXIF and XMP items of a HEIC/HEIF file (KFR-043).
//
// HEIF stores metadata as items located by byte offset (the `iloc` box), so
// removing them would mean rewriting every offset in the file. Instead the
// bytes of each metadata item are overwritten with zeros in a copy: the file
// keeps its layout, decoders still show the image, and the GPS position, camera
// and timestamps are gone. A zeroed EXIF item no longer parses, so the image
// loses its EXIF orientation along with the rest.

interface Box { type: string; start: number; body: number; end: number }

function readBoxes(buf: Buffer, from: number, to: number): Box[] {
  const boxes: Box[] = [];
  let i = from;
  while (i + 8 <= to) {
    let size = buf.readUInt32BE(i);
    const type = buf.toString('latin1', i + 4, i + 8);
    let body = i + 8;
    if (size === 1) {
      if (i + 16 > to) break;
      size = Number(buf.readBigUInt64BE(i + 8));
      body = i + 16;
    } else if (size === 0) {
      size = to - i;
    }
    if (size < body - i || i + size > to) break;
    boxes.push({ type, start: i, body, end: i + size });
    i += size;
  }
  return boxes;
}

function readUInt(buf: Buffer, at: number, bytes: number): number {
  if (bytes === 0) return 0;
  if (bytes === 8) return Number(buf.readBigUInt64BE(at));
  return buf.readUIntBE(at, bytes);
}

/** Item ids whose type is Exif, or a mime item holding XMP. */
function metadataItemIds(buf: Buffer, iinf: Box): Set<number> {
  const ids = new Set<number>();
  const version = buf[iinf.body];
  const first = iinf.body + 4 + (version === 0 ? 2 : 4);
  for (const infe of readBoxes(buf, first, iinf.end)) {
    if (infe.type !== 'infe') continue;
    const v = buf[infe.body];
    if (v < 2) continue;
    let p = infe.body + 4;
    const id = v === 2 ? buf.readUInt16BE(p) : buf.readUInt32BE(p);
    p += (v === 2 ? 2 : 4) + 2;  // item id + protection index
    const itemType = buf.toString('latin1', p, p + 4);
    const rest = buf.toString('latin1', p + 4, infe.end);
    if (itemType === 'Exif' || (itemType === 'mime' && rest.includes('rdf+xml'))) ids.add(id);
  }
  return ids;
}

/** Returns a copy with the metadata items zeroed, or null if it is not a readable HEIF. */
export function stripHeic(input: Buffer): Buffer | null {
  const top = readBoxes(input, 0, input.length);
  if (top[0]?.type !== 'ftyp') return null;
  const meta = top.find((b) => b.type === 'meta');
  if (!meta) return Buffer.from(input);
  const buf = Buffer.from(input);
  const children = readBoxes(buf, meta.body + 4, meta.end);  // meta is a full box
  const iinf = children.find((b) => b.type === 'iinf');
  const iloc = children.find((b) => b.type === 'iloc');
  const idat = children.find((b) => b.type === 'idat');
  if (!iinf || !iloc) return buf;
  const ids = metadataItemIds(buf, iinf);
  if (ids.size === 0) return buf;

  const version = buf[iloc.body];
  let p = iloc.body + 4;
  const offsetSize = buf[p] >> 4;
  const lengthSize = buf[p] & 0x0f;
  const baseOffsetSize = buf[p + 1] >> 4;
  const indexSize = version === 1 || version === 2 ? buf[p + 1] & 0x0f : 0;
  p += 2;
  const count = version < 2 ? buf.readUInt16BE(p) : buf.readUInt32BE(p);
  p += version < 2 ? 2 : 4;

  for (let n = 0; n < count && p < iloc.end; n++) {
    const id = version < 2 ? buf.readUInt16BE(p) : buf.readUInt32BE(p);
    p += version < 2 ? 2 : 4;
    const method = version === 1 || version === 2 ? buf.readUInt16BE(p) & 0x0f : 0;
    if (version === 1 || version === 2) p += 2;
    p += 2;  // data reference index
    const base = readUInt(buf, p, baseOffsetSize);
    p += baseOffsetSize;
    const extents = buf.readUInt16BE(p);
    p += 2;
    for (let e = 0; e < extents; e++) {
      p += indexSize;
      const offset = readUInt(buf, p, offsetSize);
      p += offsetSize;
      const length = readUInt(buf, p, lengthSize);
      p += lengthSize;
      if (!ids.has(id)) continue;
      const origin = method === 1 && idat ? idat.body : 0;
      if (method > 1) continue;
      const from = origin + base + offset;
      const to = length === 0 ? buf.length : Math.min(buf.length, from + length);
      if (from < buf.length) buf.fill(0, from, to);
    }
  }
  return buf;
}
