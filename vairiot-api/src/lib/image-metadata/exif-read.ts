// Reads the capture time and GPS position from a JPEG's EXIF block (stage
// 1.7), in pure TypeScript like the strippers next to it (KFR-043). Only what
// a scan photo needs: anything unexpected yields no value, never an error.

export interface ExifFacts {
  capturedAt?: Date;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
}

const SOS = 0xda;
const APP1 = 0xe1;

/** The TIFF payload of the first EXIF APP1 segment, or null. */
function exifTiff(buf: Buffer): Buffer | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let at = 2;
  while (at + 4 <= buf.length && buf[at] === 0xff) {
    const marker = buf[at + 1];
    if (marker === SOS) return null;
    const len = buf.readUInt16BE(at + 2);
    if (len < 2 || at + 2 + len > buf.length) return null;
    const body = buf.subarray(at + 4, at + 2 + len);
    if (marker === APP1 && body.subarray(0, 6).toString('latin1') === 'Exif\0\0') return body.subarray(6);
    at += 2 + len;
  }
  return null;
}

interface Entry { type: number; count: number; valueAt: number }

class Tiff {
  private readonly le: boolean;
  constructor(private readonly b: Buffer) {
    this.le = b.subarray(0, 2).toString('latin1') === 'II';
  }

  static open(b: Buffer): Tiff | null {
    const order = b.subarray(0, 2).toString('latin1');
    return b.length >= 8 && (order === 'II' || order === 'MM') ? new Tiff(b) : null;
  }

  u16(o: number) { return this.le ? this.b.readUInt16LE(o) : this.b.readUInt16BE(o); }
  u32(o: number) { return this.le ? this.b.readUInt32LE(o) : this.b.readUInt32BE(o); }
  get firstIfd() { return this.u32(4); }

  /** Tag → entry for one IFD; empty when the IFD runs off the buffer. */
  ifd(offset: number): Map<number, Entry> {
    const out = new Map<number, Entry>();
    if (offset + 2 > this.b.length) return out;
    const n = this.u16(offset);
    for (let i = 0; i < n; i++) {
      const e = offset + 2 + i * 12;
      if (e + 12 > this.b.length) break;
      const type = this.u16(e + 2);
      const count = this.u32(e + 4);
      const size = (type === 5 ? 8 : type === 3 ? 2 : type === 4 ? 4 : 1) * count;
      out.set(this.u16(e), { type, count, valueAt: size <= 4 ? e + 8 : this.u32(e + 8) });
    }
    return out;
  }

  ascii(e?: Entry): string | undefined {
    if (!e || e.type !== 2 || e.valueAt + e.count > this.b.length) return undefined;
    return this.b.toString('latin1', e.valueAt, e.valueAt + e.count).replace(/\0+$/, '');
  }

  rationals(e?: Entry): number[] | undefined {
    if (!e || e.type !== 5 || e.valueAt + e.count * 8 > this.b.length) return undefined;
    const out: number[] = [];
    for (let i = 0; i < e.count; i++) {
      const den = this.u32(e.valueAt + i * 8 + 4);
      if (den === 0) return undefined;
      out.push(this.u32(e.valueAt + i * 8) / den);
    }
    return out;
  }

  pointer(e?: Entry): number | undefined {
    return e && e.type === 4 && e.valueAt + 4 <= this.b.length ? this.u32(e.valueAt) : undefined;
  }
}

function degrees(dms: number[] | undefined, ref: string | undefined, neg: string): number | undefined {
  if (!dms || dms.length !== 3 || (ref !== neg && ref !== (neg === 'S' ? 'N' : 'E'))) return undefined;
  const v = dms[0] + dms[1] / 60 + dms[2] / 3600;
  return ref === neg ? -v : v;
}

/** "YYYY:MM:DD" + [h, m, s] in UTC, or "YYYY:MM:DD HH:MM:SS" + "+04:00". */
function exifDate(date: string, time: string, offset = 'Z'): Date | undefined {
  const d = /^(\d{4}):(\d{2}):(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2}):(\d{2})/.exec(time);
  if (!d || !t || !/^(Z|[+-]\d{2}:\d{2})$/.test(offset)) return undefined;
  const parsed = new Date(`${d[1]}-${d[2]}-${d[3]}T${t[1]}:${t[2]}:${t[3]}${offset}`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');

/**
 * Capture time and position from a JPEG. Time prefers the GPS UTC stamp,
 * then DateTimeOriginal with its OffsetTimeOriginal; a local time without an
 * offset is ambiguous and ignored.
 */
export function readJpegExifFacts(buf: Buffer): ExifFacts {
  try {
    const raw = exifTiff(buf);
    const tiff = raw && Tiff.open(raw);
    if (!tiff) return {};
    const ifd0 = tiff.ifd(tiff.firstIfd);
    const facts: ExifFacts = {};

    const gpsAt = tiff.pointer(ifd0.get(0x8825));
    if (gpsAt !== undefined) {
      const gps = tiff.ifd(gpsAt);
      const lat = degrees(tiff.rationals(gps.get(0x0002)), tiff.ascii(gps.get(0x0001)), 'S');
      const lon = degrees(tiff.rationals(gps.get(0x0004)), tiff.ascii(gps.get(0x0003)), 'W');
      if (lat !== undefined && lon !== undefined && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        facts.latitude = lat;
        facts.longitude = lon;
        const err = tiff.rationals(gps.get(0x001f));
        if (err?.length === 1 && err[0] >= 0) facts.accuracyMeters = err[0];
      }
      const stamp = tiff.rationals(gps.get(0x0007));
      const day = tiff.ascii(gps.get(0x001d));
      if (stamp?.length === 3 && day) facts.capturedAt = exifDate(day, stamp.map(pad).join(':'));
    }

    const exifAt = tiff.pointer(ifd0.get(0x8769));
    if (!facts.capturedAt && exifAt !== undefined) {
      const exif = tiff.ifd(exifAt);
      const original = tiff.ascii(exif.get(0x9003));
      const offset = tiff.ascii(exif.get(0x9011));
      if (original && offset) {
        const [date, time] = original.split(' ');
        if (date && time) facts.capturedAt = exifDate(date, time, offset);
      }
    }
    return facts;
  } catch {
    return {};
  }
}
