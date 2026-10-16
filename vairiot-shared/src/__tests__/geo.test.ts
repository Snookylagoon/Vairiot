import {
  distanceMetres,
  formatCoordinates,
  GeoError,
  googleMapsUrl,
  isGeoSource,
  openStreetMapEmbedUrl,
  openStreetMapUrl,
  parseCoordinates,
  validateGeoPosition,
} from '../index.js';

describe('validateGeoPosition', () => {
  it('accepts numbers and numeric strings, rounding to 6 dp', () => {
    expect(validateGeoPosition(41.71512345, '44.8271')).toEqual({ latitude: 41.715123, longitude: 44.8271 });
  });

  it('accepts the boundaries', () => {
    expect(validateGeoPosition(-90, 180)).toEqual({ latitude: -90, longitude: 180 });
  });

  it.each([
    [91, 0, 'GEO_LATITUDE_RANGE'],
    [0, -180.5, 'GEO_LONGITUDE_RANGE'],
    ['', 0, 'GEO_NOT_A_NUMBER'],
    ['abc', 0, 'GEO_NOT_A_NUMBER'],
    [NaN, 0, 'GEO_NOT_A_NUMBER'],
    [null, 0, 'GEO_NOT_A_NUMBER'],
  ])('rejects (%p, %p) with %s', (lat, lng, code) => {
    expect(() => validateGeoPosition(lat, lng)).toThrow(GeoError);
    try { validateGeoPosition(lat, lng); } catch (e) { expect((e as GeoError).code).toBe(code); }
  });
});

describe('parseCoordinates', () => {
  it.each([
    ['41.7151, 44.8271', 41.7151, 44.8271],
    ['41.7151 44.8271', 41.7151, 44.8271],
    ['-33.8688;151.2093', -33.8688, 151.2093],
    ['https://www.google.com/maps/@41.7151,44.8271,17z', 41.7151, 44.8271],
    ['https://maps.google.com/?q=51.5074,-0.1278', 51.5074, -0.1278],
    ['https://www.openstreetmap.org/#map=17/41.7151/44.8271', 41.7151, 44.8271],
  ])('reads %s', (text, latitude, longitude) => {
    expect(parseCoordinates(text)).toEqual({ latitude, longitude });
  });

  it.each(['', 'Server Room', 'Room 12 34', '95.1, 10.2'])('returns null for %p', (text) => {
    expect(parseCoordinates(text)).toBeNull();
  });
});

describe('formatting and links', () => {
  const p = { latitude: 41.7151, longitude: 44.8271 };

  it('formats to 6 dp', () => {
    expect(formatCoordinates(p)).toBe('41.715100, 44.827100');
  });

  it('builds map links', () => {
    expect(openStreetMapUrl(p)).toBe('https://www.openstreetmap.org/?mlat=41.7151&mlon=44.8271#map=18/41.7151/44.8271');
    expect(googleMapsUrl(p)).toBe('https://www.google.com/maps/search/?api=1&query=41.7151,44.8271');
    expect(openStreetMapEmbedUrl(p)).toContain('marker=41.7151,44.8271');
  });

  it('clamps the embed bounding box at the poles', () => {
    expect(openStreetMapEmbedUrl({ latitude: 90, longitude: 180 })).toContain('bbox=179.998,89.998,180,90');
  });
});

describe('isGeoSource', () => {
  it('knows the capture sources', () => {
    expect(isGeoSource('device')).toBe(true);
    expect(isGeoSource('satellite')).toBe(false);
  });
});

describe('distanceMetres', () => {
  it('is zero for the same point and symmetric', () => {
    const a = { latitude: 41.7151, longitude: 44.8271 };
    const b = { latitude: 41.6934, longitude: 44.8015 };
    expect(distanceMetres(a, a)).toBe(0);
    expect(distanceMetres(a, b)).toBeCloseTo(distanceMetres(b, a), 6);
  });

  it('measures about 111 km per degree of latitude and sub-metre moves', () => {
    expect(distanceMetres({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })).toBeCloseTo(111_195, -2);
    // 0.000005° of latitude ≈ 0.56 m: below the 1 m correction threshold.
    expect(distanceMetres({ latitude: 41.7, longitude: 44.8 }, { latitude: 41.700005, longitude: 44.8 })).toBeLessThan(1);
  });
});

