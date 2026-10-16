// OpenAPI paths for photos bound to audit scans (stage 1.7). Kept out of the
// baselined openapi.ts; merged in api-spec.ts.
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string' } };

export const scanPhotoPaths = {
  '/audits/{id}/scans/{scanRef}/photos': {
    post: {
      tags: ['Audits'],
      summary: 'Attach a photo to an audit scan',
      description:
        'scanRef is the scan id or the clientRequestId the device queued the scan under. Position: the values ' +
        'sent, else the photo’s EXIF GPS, else the scan’s position (none while GIS is off). Capture time: the ' +
        'value sent, else EXIF, else the scan time. The stored original keeps its metadata; downloads are ' +
        'stripped (KFR-043). At most 4 photos per scan.',
      parameters: [idParam, { name: 'scanRef', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['photo'],
              properties: {
                photo: { type: 'string', format: 'binary' },
                thumb: { type: 'string', format: 'binary' },
                photoType: { type: 'string', enum: ['inventory', 'condition', 'label', 'general'], default: 'inventory' },
                latitude: { type: 'number' },
                longitude: { type: 'number' },
                geoAccuracyMeters: { type: 'number' },
                capturedAt: { type: 'string', format: 'date-time' },
                deviceId: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        201: { description: 'The stored photo' },
        400: { description: 'No file, bad photoType, or the scan already has 4 photos' },
        404: { description: 'Campaign or scan not found' },
      },
    },
  },
  '/audits/{id}/photos': {
    get: {
      tags: ['Audits'],
      summary: 'Scan photos of a campaign',
      description: 'Blind campaigns report result "recorded" and no assetId until completed.',
      parameters: [idParam, { name: 'locationId', in: 'query', schema: { type: 'string' } }],
      responses: { 200: { description: 'Photos with their scan’s tag, zone and result' }, 404: { description: 'Campaign not found' } },
    },
  },
} as const;
