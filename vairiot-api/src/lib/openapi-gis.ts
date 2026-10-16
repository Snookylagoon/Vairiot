// OpenAPI paths of the `gis` module (stage 1.4). Kept out of openapi.ts,
// which is on the line-limit baseline and may not grow; app.ts merges them.
const assetFilters = ['search', 'categoryId', 'siteId', 'status', 'condition'].map((name) => ({
  name,
  in: 'query',
  schema: { type: 'string' },
}));

const notFoundWhenOff = { description: 'GIS is switched off for the tenant (`gis` feature flag)' };

export const gisPaths = {
  '/assets/map': {
    get: {
      tags: ['Assets'],
      summary: 'Positions of every placed asset, with the asset list filters',
      parameters: assetFilters,
      responses: { 200: { description: 'Placed assets and the count without a position' }, 404: notFoundWhenOff },
    },
  },
  '/assets/geo': {
    get: {
      tags: ['Assets'],
      summary: 'Assets inside a bounding box, as GeoJSON',
      parameters: [
        {
          name: 'bbox',
          in: 'query',
          required: true,
          description: 'minLon,minLat,maxLon,maxLat in WGS 84 decimal degrees',
          schema: { type: 'string', example: '44.7,41.6,44.9,41.8' },
        },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 5000, default: 1000 } },
      ],
      responses: {
        200: {
          description: 'GeoJSON FeatureCollection; `truncated` is true when the limit cut the result short',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['FeatureCollection'] },
                  truncated: { type: 'boolean' },
                  features: { type: 'array', items: { type: 'object' } },
                },
              },
            },
          },
        },
        400: { description: 'Invalid bbox or limit' },
        404: notFoundWhenOff,
      },
    },
  },
  '/gis/map-settings': {
    get: {
      tags: ['GIS'],
      summary: 'The tenant’s base map: tile URL, attribution, default centre and zoom',
      responses: { 200: { description: 'Stored settings over the OpenStreetMap defaults' }, 404: notFoundWhenOff },
    },
    put: {
      tags: ['GIS'],
      summary: 'Set the tenant’s base map (company:manage; audited)',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['tileUrl', 'attribution', 'centreLatitude', 'centreLongitude', 'zoom'],
              properties: {
                tileUrl: { type: 'string', example: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' },
                attribution: { type: 'string', description: 'Plain text only' },
                centreLatitude: { type: 'number' },
                centreLongitude: { type: 'number' },
                zoom: { type: 'integer', minimum: 1, maximum: 19 },
              },
            },
          },
        },
      },
      responses: { 200: { description: 'Saved settings' }, 400: { description: 'Invalid settings' }, 404: notFoundWhenOff },
    },
  },
  '/audits/{id}/map': {
    get: {
      tags: ['Audits'],
      summary: 'Campaign layer for the asset map',
      description:
        'Every expected asset with a position, in state verified, misplaced, condition_variance, missing or ' +
        'not_scanned (live from the scans; a completed blind campaign uses its reconciliation), plus surplus tags ' +
        'at their scan position. A blind campaign in progress reports only scanned / not_scanned. Assets without ' +
        'a register position use their scan position.',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'campaign, points, counts by state, unplaced' },
        404: { description: 'Campaign not found, or GIS switched off for the tenant' },
      },
    },
  },
  '/audits/{id}/scans/geo': {
    get: {
      tags: ['Audits'],
      summary: 'Positioned scans of a campaign, as GeoJSON',
      description:
        'Scans carry the device position when POST /audits/{id}/scans is sent with latitude, longitude and ' +
        'geoAccuracyMeters (stage 1.5). A bad position is dropped, never the scan. Blind campaigns report ' +
        'result "recorded" and no assetId until completed.',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'GeoJSON FeatureCollection of scans with a position' },
        404: { description: 'Campaign not found, or GIS switched off for the tenant' },
      },
    },
  },
} as const;
