// Removes metadata from a JPEG without re-encoding it (KFR-043).
//
// Dropped: APP1 (EXIF, including GPS, and XMP), APP3–APP13 and APP15 (IPTC,
// Photoshop and vendor blocks), comments, the APP2 MPF index, and anything after
// the end-of-image marker (MPF secondary images, such as an iPhone's gain map,
// each carry their own EXIF). Kept: APP0 (JFIF), APP2 ICC profiles, APP14
// (Adobe colour transform) and all image data. The EXIF orientation is put back
// as a one-tag EXIF block, so photos taken sideways still display upright.

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const APP0 = 0xe0;
const APP1 = 0xe1;
const APP2 = 0xe2;
const APP14 = 0xee;
const COM = 0xfe;

function startsWith(buf: Buffer, at: number, text: string): boolean {
  return buf.subarray(at, at + text.length).toString('latin1') === text;
}

/** Orientation (1–8) from an APP1 EXIF payload, or 1 when absent or unreadable. */
export function readExifOrientation(payload: Buffer): number {
  if (!startsWith(payload, 0, 'Exif\0\0')) return 1;
  const tiff = payload.subarray(6);
  if (tiff.length < 8) return 1;
  const le = startsWith(tiff, 0, 'II');
  if (!le && !startsWith(tiff, 0, 'MM')) return 1;
  const u16 = (o: number) => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
  const u32 = (o: number) => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
  const ifd = u32(4);
  if (ifd + 2 > tiff.length) return 1;
  const entries = u16(ifd);
  for (let i = 0; i < entries; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > tiff.length) return 1;
    if (u16(e) === 0x0112) {
      const v = u16(e + 8);
      return v >= 1 && v <= 8 ? v : 1;
    }
  }
  return 1;
}

/** A minimal APP1 segment holding only the orientation tag (big-endian TIFF). */
export function orientationSegment(orientation: number): Buffer {
  const body = Buffer.alloc(6 + 8 + 2 + 12 + 4);
  body.write('Exif\0\0', 0, 'latin1');
  body.write('MM', 6, 'latin1');
  body.writeUInt16BE(42, 8);
  body.writeUInt32BE(8, 10);         // IFD0 straight after the header
  body.writeUInt16BE(1, 14);         // one entry
  body.writeUInt16BE(0x0112, 16);    // Orientation
  body.writeUInt16BE(3, 18);         // SHORT
  body.writeUInt32BE(1, 20);         // count 1
  body.writeUInt16BE(orientation, 24);
  body.writeUInt32BE(0, 28);         // no next IFD
  const head = Buffer.from([0xff, APP1, 0, 0]);
  head.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([head, body]);
}

function keepSegment(marker: number, payload: Buffer): boolean {
  if (marker === APP0 || marker === APP14) return true;
  if (marker === APP2) return startsWith(payload, 0, 'ICC_PROFILE\0');
  if (marker >= APP1 && marker <= 0xef) return false;
  return marker !== COM;
}

/** Returns the JPEG without metadata, or null if it is not a readable JPEG. */
export function stripJpeg(buf: Buffer): Buffer | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== SOI) return null;
  const out: Buffer[] = [buf.subarray(0, 2)];
  let orientation = 1;
  let insertAt = 1;  // after SOI, or after APP0 once seen
  let i = 2;

  while (i < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    if (marker === 0xff) { i++; continue; }  // fill byte
    if (marker === EOI) { out.push(buf.subarray(i, i + 2)); break; }
    if (i + 4 > buf.length) return null;
    const len = buf.readUInt16BE(i + 2);
    const end = i + 2 + len;
    if (len < 2 || end > buf.length) return null;
    const payload = buf.subarray(i + 4, end);

    if (marker === APP1) orientation = Math.max(orientation, readExifOrientation(payload));
    if (keepSegment(marker, payload)) {
      out.push(buf.subarray(i, end));
      if (marker === APP0) insertAt = out.length;
    }
    i = end;

    if (marker === SOS) {
      // Entropy-coded data: copy up to the next real marker. 0xFF00 is a
      // stuffed byte and 0xFFD0–D7 are restart markers, both part of the scan.
      const start = i;
      while (i < buf.length - 1) {
        if (buf[i] === 0xff && buf[i + 1] !== 0 && (buf[i + 1] < 0xd0 || buf[i + 1] > 0xd7)) break;
        i++;
      }
      // A file cut short mid-scan still displays partially; the metadata
      // segments all come before the scan, so the rest is safe to keep.
      if (i >= buf.length - 1) { out.push(buf.subarray(start)); break; }
      out.push(buf.subarray(start, i));
    }
  }

  if (orientation !== 1) out.splice(insertAt, 0, orientationSegment(orientation));
  return Buffer.concat(out);
}
