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
} as const;
