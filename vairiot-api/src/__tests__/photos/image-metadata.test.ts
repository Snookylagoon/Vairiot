import { stripImageMetadata } from '../../lib/image-metadata';
import { readExifOrientation } from '../../lib/image-metadata/jpeg';

import {
  SECRET, heicWithMetadata, jpegWithMetadata, pngWithMetadata, webpWithMetadata,
} from './image-fixtures';

// KFR-043: uploaded images kept their EXIF/GPS, and every download or share
// handed it on. These check the strippers on files with planted metadata.

const has = (buf: Buffer, text: string) => buf.includes(Buffer.from(text, 'latin1'));

describe('JPEG metadata strip', () => {
  const original = jpegWithMetadata(6);
  const stripped = stripImageMetadata(original, 'image/jpeg');

  it('removes EXIF/GPS, XMP, IPTC, comments, the MPF index and trailing images', () => {
    expect(has(original, SECRET)).toBe(true);
    for (const s of [SECRET, 'XMP-SECRET', 'IPTC-SECRET', 'COMMENT-SECRET', 'MPF-SECRET']) {
      expect(has(stripped, s)).toBe(false);
    }
    expect(stripped.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
    expect(stripped.indexOf(Buffer.from([0xff, 0xd9]))).toBe(stripped.length - 2);
  });

  it('keeps JFIF, the ICC profile and the scan data byte for byte', () => {
    expect(has(stripped, 'JFIF')).toBe(true);
    expect(has(stripped, 'KEEP-ICC')).toBe(true);
    expect(stripped.includes(Buffer.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, 0x78]))).toBe(true);
  });

  it('keeps the orientation as a one-tag EXIF block', () => {
    const at = stripped.indexOf(Buffer.from('Exif\0\0', 'latin1'));
    expect(at).toBeGreaterThan(0);
    const len = stripped.readUInt16BE(at - 2);
    expect(readExifOrientation(stripped.subarray(at, at - 2 + len))).toBe(6);
  });

  it('adds no EXIF block when the photo was upright', () => {
    const upright = stripImageMetadata(jpegWithMetadata(1), 'image/jpeg');
    expect(has(upright, 'Exif')).toBe(false);
  });

  it('detects a JPEG by its signature whatever the stored type says', () => {
    expect(has(stripImageMetadata(original, 'image/png'), SECRET)).toBe(false);
  });

  it('refuses a broken image rather than serving it unstripped', () => {
    const broken = Buffer.concat([original.subarray(0, 6), Buffer.from([0x00, 0x00])]);
    expect(() => stripImageMetadata(broken, 'image/jpeg')).toThrow(/metadata/);
  });
});

describe('PNG, WebP and HEIC metadata strip', () => {
  it('PNG: drops eXIf and text chunks, keeps image and colour chunks', () => {
    const out = stripImageMetadata(pngWithMetadata(), 'image/png');
    expect(has(out, SECRET)).toBe(false);
    expect(has(out, 'TEXT-SECRET')).toBe(false);
    for (const keep of ['IHDR', 'iCCP', 'IDAT', 'IEND']) expect(has(out, keep)).toBe(true);
  });

  it('WebP: drops EXIF and XMP, clears their VP8X flags and fixes the RIFF size', () => {
    const out = stripImageMetadata(webpWithMetadata(), 'image/webp');
    expect(has(out, SECRET)).toBe(false);
    expect(has(out, 'XMP-SECRET')).toBe(false);
    expect(has(out, 'IMAGEDATA')).toBe(true);
    expect(out.readUInt32LE(4)).toBe(out.length - 8);
    const vp8x = out.indexOf(Buffer.from('VP8X', 'latin1'));
    expect(out[vp8x + 8] & 0x0c).toBe(0);
    expect(out[vp8x + 8] & 0x20).toBe(0x20);  // ICC flag kept
  });

  it('HEIC: zeroes the Exif item, leaves the image item and the layout alone', () => {
    const original = heicWithMetadata();
    const out = stripImageMetadata(original, 'image/heic');
    expect(has(original, SECRET)).toBe(true);
    expect(has(out, SECRET)).toBe(false);
    expect(has(out, 'HEVC-IMAGE-DATA')).toBe(true);
    expect(out.length).toBe(original.length);
  });

  it('passes non-image files through untouched', () => {
    const pdf = Buffer.from('%PDF-1.7 SECRET-GPS', 'latin1');
    expect(stripImageMetadata(pdf, 'application/pdf')).toBe(pdf);
  });
});
