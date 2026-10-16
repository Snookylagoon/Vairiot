import { stripImageMetadata } from '../../lib/image-metadata';
import { readJpegExifFacts } from '../../lib/image-metadata/exif-read';

import { jpegWithExif } from './exif-fixtures';

// Stage 1.7: capture time and GPS from a JPEG, for scan photos.

describe('readJpegExifFacts', () => {
  it('reads position and accuracy, in both byte orders', () => {
    for (const bigEndian of [false, true]) {
      const facts = readJpegExifFacts(jpegWithExif({ latitude: 41.7151, longitude: 44.8271, accuracyMeters: 4.5, bigEndian }));
      expect(facts.latitude).toBeCloseTo(41.7151, 5);
      expect(facts.longitude).toBeCloseTo(44.8271, 5);
      expect(facts.accuracyMeters).toBe(4.5);
    }
  });

  it('signs southern and western positions', () => {
    const facts = readJpegExifFacts(jpegWithExif({ latitude: -33.8688, longitude: -70.6693 }));
    expect(facts.latitude).toBeCloseTo(-33.8688, 4);
    expect(facts.longitude).toBeCloseTo(-70.6693, 4);
  });

  it('prefers the GPS UTC stamp for the capture time', () => {
    const facts = readJpegExifFacts(jpegWithExif({
      latitude: 41.7, longitude: 44.8, gpsDate: '2026:10:16', gpsTime: '08:30:15',
      original: '2026:10:16 12:30:15', offset: '+05:00',
    }));
    expect(facts.capturedAt?.toISOString()).toBe('2026-10-16T08:30:15.000Z');
  });

  it('uses DateTimeOriginal only with its offset', () => {
    expect(readJpegExifFacts(jpegWithExif({ original: '2026:10:16 12:30:15', offset: '+04:00' })).capturedAt?.toISOString())
      .toBe('2026-10-16T08:30:15.000Z');
    expect(readJpegExifFacts(jpegWithExif({ original: '2026:10:16 12:30:15' })).capturedAt).toBeUndefined();
  });

  it('returns nothing for files without EXIF or broken data', () => {
    expect(readJpegExifFacts(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))).toEqual({});
    expect(readJpegExifFacts(Buffer.from('not an image'))).toEqual({});
    const truncated = jpegWithExif({ latitude: 41.7, longitude: 44.8 }).subarray(0, 40);
    expect(readJpegExifFacts(truncated)).toEqual({});
  });

  it('finds nothing once the file has been stripped (KFR-043)', () => {
    const jpeg = jpegWithExif({ latitude: 41.7, longitude: 44.8, gpsDate: '2026:10:16', gpsTime: '08:30:15' });
    expect(readJpegExifFacts(stripImageMetadata(jpeg, 'image/jpeg'))).toEqual({});
  });
});
