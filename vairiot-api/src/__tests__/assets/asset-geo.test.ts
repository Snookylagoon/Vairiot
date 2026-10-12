import { ValidationError } from '../../lib/errors';
import { resolveAssetGeo } from '../../services/asset-geo.service';

describe('resolveAssetGeo', () => {
  const placed = { latitude: 41.7151, longitude: 44.8271 };
  const unplaced = { latitude: null, longitude: null };

  it('leaves the position alone when no coordinate is sent', () => {
    expect(resolveAssetGeo({})).toBeUndefined();
    expect(resolveAssetGeo({ geoAccuracyMeters: 5 }, placed)).toBeUndefined();
  });

  it('stores a validated, rounded position with defaults', () => {
    const geo = resolveAssetGeo({ latitude: '41.71512345', longitude: 44.8271 });
    expect(geo).toMatchObject({ latitude: 41.715123, longitude: 44.8271, geoAccuracyMeters: null, geoSource: 'manual' });
    expect(geo!.geoCapturedAt).toBeInstanceOf(Date);
  });

  it('keeps accuracy, source and capture time from a device fix', () => {
    const geo = resolveAssetGeo({
      latitude: 41.7151, longitude: 44.8271, geoAccuracyMeters: 4.26, geoSource: 'device',
      geoCapturedAt: '2026-10-12T09:00:00.000Z',
    });
    expect(geo).toEqual({
      latitude: 41.7151, longitude: 44.8271, geoAccuracyMeters: 4.3, geoSource: 'device',
      geoCapturedAt: new Date('2026-10-12T09:00:00.000Z'),
    });
  });

  it('honours a caller-chosen default source', () => {
    expect(resolveAssetGeo({ latitude: 1.5, longitude: 2.5 }, null, 'import')?.geoSource).toBe('import');
  });

  it('clears the position and its metadata', () => {
    expect(resolveAssetGeo({ latitude: null, longitude: null }, placed)).toEqual({
      latitude: null, longitude: null, geoAccuracyMeters: null, geoSource: null, geoCapturedAt: null,
    });
    expect(resolveAssetGeo({ latitude: '', longitude: '' }, placed)?.latitude).toBeNull();
  });

  it('treats clearing an unplaced asset, or re-sending its position, as no change', () => {
    expect(resolveAssetGeo({ latitude: null, longitude: null }, unplaced)).toBeUndefined();
    expect(resolveAssetGeo({ latitude: '41.7151', longitude: '44.8271', geoSource: 'manual' }, placed)).toBeUndefined();
  });

  it.each([
    [{ latitude: 41.7 }, /together/],
    [{ latitude: 41.7, longitude: null }, /together/],
    [{ latitude: 95, longitude: 0 }, /Latitude must be between/],
    [{ latitude: 0, longitude: 200 }, /Longitude must be between/],
    [{ latitude: 'north', longitude: 0 }, /must be numbers/],
    [{ latitude: 1.5, longitude: 2.5, geoAccuracyMeters: -1 }, /accuracy/],
    [{ latitude: 1.5, longitude: 2.5, geoSource: 'satellite' }, /source/],
    [{ latitude: 1.5, longitude: 2.5, geoCapturedAt: 'yesterday' }, /capture time/],
  ])('rejects %p', (input, message) => {
    expect(() => resolveAssetGeo(input)).toThrow(ValidationError);
    expect(() => resolveAssetGeo(input)).toThrow(message);
  });
});
