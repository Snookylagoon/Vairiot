// Small hand-built images carrying planted metadata, for the KFR-043 tests.
// Each one holds the text SECRET-GPS (and friends) inside its metadata blocks,
// so a test can assert by byte search that the stripped copy no longer does.

export const SECRET = 'SECRET-GPS';

function segment(marker: number, payload: Buffer): Buffer {
  const head = Buffer.from([0xff, marker, 0, 0]);
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

/** EXIF (little-endian) with Orientation and a fake GPS ASCII tag in IFD0. */
function exifPayload(orientation: number): Buffer {
  const text = Buffer.from(`${SECRET}\0`, 'latin1');
  const tiff = Buffer.alloc(8 + 2 + 2 * 12 + 4);
  tiff.write('II', 0, 'latin1');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(2, 8);
  // Orientation, SHORT, 1
  tiff.writeUInt16LE(0x0112, 10); tiff.writeUInt16LE(3, 12); tiff.writeUInt32LE(1, 14); tiff.writeUInt16LE(orientation, 18);
  // GPSLatitudeRef stand-in: ASCII pointing at the text after the IFD
  tiff.writeUInt16LE(0x8825, 22); tiff.writeUInt16LE(2, 24); tiff.writeUInt32LE(text.length, 26);
  tiff.writeUInt32LE(tiff.length, 30);
  return Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff, text]);
}

export function jpegWithMetadata(orientation = 6): Buffer {
  const entropy = Buffer.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, 0x78]);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1')),
    segment(0xe1, exifPayload(orientation)),
    segment(0xe1, Buffer.from('http://ns.adobe.com/xap/1.0/\0<xmp>XMP-SECRET</xmp>', 'latin1')),
    segment(0xe2, Buffer.from('ICC_PROFILE\0\x01\x01KEEP-ICC', 'latin1')),
    segment(0xe2, Buffer.from('MPF\0MPF-SECRET', 'latin1')),
    segment(0xed, Buffer.from('Photoshop 3.0\0IPTC-SECRET', 'latin1')),
    segment(0xfe, Buffer.from('COMMENT-SECRET', 'latin1')),
    segment(0xdb, Buffer.alloc(65, 1)),                       // DQT
    segment(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])),        // SOS header
    entropy,
    Buffer.from([0xff, 0xd9]),
    // An MPF secondary image after EOI, with its own EXIF
    Buffer.from([0xff, 0xd8]), segment(0xe1, exifPayload(1)), Buffer.from([0xff, 0xd9]),
  ]);
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export function pngWithMetadata(): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0])),
    pngChunk('eXIf', exifPayload(1).subarray(6)),
    pngChunk('tEXt', Buffer.from('Comment\0TEXT-SECRET', 'latin1')),
    pngChunk('iCCP', Buffer.from('KEEP-ICC\0\0', 'latin1')),
    pngChunk('IDAT', Buffer.from([0x78, 0x9c, 0x63, 0, 0, 0, 2, 0, 1])),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function riffChunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.write(type, 0, 'latin1');
  head.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
}

export function webpWithMetadata(): Buffer {
  const vp8x = Buffer.alloc(10);
  vp8x[0] = 0x08 | 0x04 | 0x20;  // EXIF, XMP, ICC
  const body = Buffer.concat([
    Buffer.from('WEBP', 'latin1'),
    riffChunk('VP8X', vp8x),
    riffChunk('ICCP', Buffer.from('KEEP-ICC', 'latin1')),
    riffChunk('VP8 ', Buffer.from('IMAGEDATA', 'latin1')),
    riffChunk('EXIF', exifPayload(1)),
    riffChunk('XMP ', Buffer.from('<xmp>XMP-SECRET</xmp>', 'latin1')),
  ]);
  const head = Buffer.alloc(8);
  head.write('RIFF', 0, 'latin1');
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

function box(type: string, ...parts: Buffer[]): Buffer {
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length + 8);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, body]);
}

function fullBox(type: string, version: number, ...parts: Buffer[]): Buffer {
  return box(type, Buffer.from([version, 0, 0, 0]), ...parts);
}

/** HEIF with item 1 = image ('hvc1') and item 2 = Exif, both in mdat (iloc v1). */
export function heicWithMetadata(): Buffer {
  const image = Buffer.from('HEVC-IMAGE-DATA', 'latin1');
  const exif = Buffer.concat([Buffer.from([0, 0, 0, 6]), exifPayload(1)]);
  const infe = (id: number, type: string) =>
    fullBox('infe', 2, Buffer.from([0, id, 0, 0]), Buffer.from(type, 'latin1'), Buffer.from([0]));
  const iinf = fullBox('iinf', 0, Buffer.from([0, 2]), infe(1, 'hvc1'), infe(2, 'Exif'));
  const ftyp = box('ftyp', Buffer.from('heic\0\0\0\0mif1heic', 'latin1'));

  const build = (imageAt: number, exifAt: number) => {
    const entry = (id: number, at: number, len: number) => {
      const b = Buffer.alloc(2 + 2 + 2 + 2 + 4 + 4);
      b.writeUInt16BE(id, 0); b.writeUInt16BE(0, 2); b.writeUInt16BE(0, 4);
      b.writeUInt16BE(1, 6); b.writeUInt32BE(at, 8); b.writeUInt32BE(len, 12);
      return b;
    };
    const iloc = fullBox('iloc', 1, Buffer.from([0x44, 0x00, 0, 2]),
      entry(1, imageAt, image.length), entry(2, exifAt, exif.length));
    const meta = fullBox('meta', 0, box('hdlr', Buffer.alloc(24)), iinf, iloc);
    return Buffer.concat([ftyp, meta, box('mdat', image, exif)]);
  };
  const probe = build(0, 0);
  const mdatBody = probe.length - image.length - exif.length;
  return build(mdatBody, mdatBody + image.length);
}
