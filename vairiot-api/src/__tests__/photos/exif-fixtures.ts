// Builds JPEGs with real EXIF capture time and GPS blocks for the reader in
// lib/image-metadata/exif-read.ts (stage 1.7). Tags are laid out the way
// cameras write them: IFD0 points at the Exif and GPS IFDs.

type Value =
  | { tag: number; type: 2; text: string }
  | { tag: number; type: 4; long: number }
  | { tag: number; type: 5; rationals: Array<[number, number]> };

interface Ifd { entries: Value[] }

function valueSize(v: Value): number {
  if (v.type === 2) return v.text.length + 1;
  if (v.type === 4) return 4;
  return v.rationals.length * 8;
}

/** Writes IFDs one after another, each value area straight after its IFD. */
function buildTiff(ifds: Ifd[], le: boolean, link: (offsets: number[]) => void): Buffer {
  const offsets: number[] = [];
  let at = 8;
  for (const ifd of ifds) {
    offsets.push(at);
    at += 2 + ifd.entries.length * 12 + 4;
    for (const v of ifd.entries) if (valueSize(v) > 4) at += valueSize(v);
  }
  link(offsets);
  const b = Buffer.alloc(at);
  const u16 = (o: number, n: number) => (le ? b.writeUInt16LE(n, o) : b.writeUInt16BE(n, o));
  const u32 = (o: number, n: number) => (le ? b.writeUInt32LE(n, o) : b.writeUInt32BE(n, o));
  b.write(le ? 'II' : 'MM', 0, 'latin1');
  u16(2, 42);
  u32(4, 8);
  ifds.forEach((ifd, i) => {
    const start = offsets[i];
    let data = start + 2 + ifd.entries.length * 12 + 4;
    u16(start, ifd.entries.length);
    ifd.entries.forEach((v, j) => {
      const e = start + 2 + j * 12;
      const count = v.type === 2 ? v.text.length + 1 : v.type === 4 ? 1 : v.rationals.length;
      u16(e, v.tag);
      u16(e + 2, v.type);
      u32(e + 4, count);
      const size = valueSize(v);
      const where = size > 4 ? data : e + 8;
      if (size > 4) { u32(e + 8, data); data += size; }
      if (v.type === 2) b.write(`${v.text}\0`, where, 'latin1');
      if (v.type === 4) u32(where, v.long);
      if (v.type === 5) v.rationals.forEach(([n, d], k) => { u32(where + k * 8, n); u32(where + k * 8 + 4, d); });
    });
  });
  return b;
}

const dms = (deg: number): Array<[number, number]> => {
  const a = Math.abs(deg);
  const d = Math.floor(a);
  const m = Math.floor((a - d) * 60);
  const s = Math.round(((a - d) * 60 - m) * 60 * 10000);
  return [[d, 1], [m, 1], [s, 10000]];
};

export interface ExifSpec {
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  /** UTC "YYYY:MM:DD" + "HH:MM:SS" written as the GPS stamp. */
  gpsDate?: string;
  gpsTime?: string;
  /** DateTimeOriginal "YYYY:MM:DD HH:MM:SS" and OffsetTimeOriginal "+04:00". */
  original?: string;
  offset?: string;
  bigEndian?: boolean;
}

export function jpegWithExif(spec: ExifSpec): Buffer {
  const gps: Value[] = [];
  if (spec.latitude !== undefined && spec.longitude !== undefined) {
    gps.push({ tag: 0x0001, type: 2, text: spec.latitude < 0 ? 'S' : 'N' });
    gps.push({ tag: 0x0002, type: 5, rationals: dms(spec.latitude) });
    gps.push({ tag: 0x0003, type: 2, text: spec.longitude < 0 ? 'W' : 'E' });
    gps.push({ tag: 0x0004, type: 5, rationals: dms(spec.longitude) });
  }
  if (spec.gpsTime) {
    gps.push({ tag: 0x0007, type: 5, rationals: spec.gpsTime.split(':').map((n) => [Number(n), 1] as [number, number]) });
  }
  if (spec.gpsDate) gps.push({ tag: 0x001d, type: 2, text: spec.gpsDate });
  if (spec.accuracyMeters !== undefined) gps.push({ tag: 0x001f, type: 5, rationals: [[Math.round(spec.accuracyMeters * 10), 10]] });

  const exif: Value[] = [];
  if (spec.original) exif.push({ tag: 0x9003, type: 2, text: spec.original });
  if (spec.offset) exif.push({ tag: 0x9011, type: 2, text: spec.offset });

  const ifd0: Value[] = [];
  const ifds: Ifd[] = [{ entries: ifd0 }];
  if (exif.length) ifds.push({ entries: exif });
  if (gps.length) ifds.push({ entries: gps });
  // Pointers are placeholders until the layout is known; their size is fixed.
  if (exif.length) ifd0.push({ tag: 0x8769, type: 4, long: 0 });
  if (gps.length) ifd0.push({ tag: 0x8825, type: 4, long: 0 });

  const tiff = buildTiff(ifds, !spec.bigEndian, (offsets) => {
    let k = 1;
    for (const v of ifd0) if (v.type === 4) v.long = offsets[k++];
  });
  const app1 = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const len = Buffer.alloc(2);
  len.writeUInt16BE(app1.length + 2);
  // SOI, APP1, a token SOS and EOI: enough for the reader and the stripper.
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe1]), len, app1,
    Buffer.from([0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9]),
  ]);
}
