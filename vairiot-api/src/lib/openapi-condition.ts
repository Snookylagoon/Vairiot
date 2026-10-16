// OpenAPI paths for the condition scale and photo rules (stage 1.13). Kept
// out of the baselined openapi.ts; merged in api-spec.ts.
const entry = {
  type: 'object',
  required: ['grade', 'label', 'criteria', 'colour', 'impairmentIndicator', 'photoRequired'],
  properties: {
    grade: { type: 'integer', minimum: 1, maximum: 5 },
    label: { type: 'string' }, criteria: { type: 'string' }, colour: { type: 'string', example: '#16a34a' },
    impairmentIndicator: { type: 'boolean' }, photoRequired: { type: 'boolean' },
  },
};

export const conditionPaths = {
  '/condition/scale': {
    get: {
      tags: ['Condition'],
      summary: 'The condition scale for a category, else the tenant, else the default',
      parameters: [{ name: 'categoryId', in: 'query', schema: { type: 'string' } }],
      responses: { 200: { description: '{ source: category | tenant | default, entries[5] }' } },
    },
    put: {
      tags: ['Condition'],
      summary: 'Replace the tenant’s or a category’s scale (company:manage; audited)',
      description: 'Five entries, one per grade. entries: null removes the scale so the next level applies.',
      requestBody: { required: true, content: { 'application/json': { schema: {
        type: 'object', properties: { categoryId: { type: 'string', nullable: true }, entries: { type: 'array', items: entry, nullable: true } },
      } } } },
      responses: { 200: { description: 'The scale now in force' }, 400: { description: 'Invalid scale' }, 404: { description: 'Category not found' } },
    },
  },
  '/condition/photo-rules': {
    get: { tags: ['Condition'], summary: 'Minimum photos per scan at inventory', responses: { 200: { description: '{ defaultMinPhotos, categories[] }' } } },
    put: {
      tags: ['Condition'],
      summary: 'Replace the photo rules (company:manage; audited)',
      requestBody: { required: true, content: { 'application/json': { schema: {
        type: 'object', required: ['defaultMinPhotos', 'categories'],
        properties: {
          defaultMinPhotos: { type: 'integer', minimum: 0, maximum: 4 },
          categories: { type: 'array', items: { type: 'object', properties: { categoryId: { type: 'string' }, minPhotosAtInventory: { type: 'integer', minimum: 0, maximum: 4 } } } },
        },
      } } } },
      responses: { 200: { description: 'The rules now in force' }, 400: { description: 'Invalid rules' } },
    },
  },
  '/audits/{id}/photo-warnings': {
    get: {
      tags: ['Audits'],
      summary: 'Scans that miss the photo rules',
      description: 'below_minimum: fewer photos than the category minimum; grade_needs_photo: no photo at a grade whose scale needs one. Also returned as photoWarnings by zone submission. Warnings only.',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'locationId', in: 'query', schema: { type: 'string' } }],
      responses: { 200: { description: 'Warnings' } },
    },
  },
} as const;
