// OpenAPI paths of the `ipsas` module (Phase 2) and the platform console's
// module switches (stage 2.2). Kept out of openapi.ts, which is on the
// line-limit baseline; api-spec.ts merges them.
const notFoundWhenOff = { description: 'The IPSAS ledger is switched off for the tenant (`ipsas` module)' };

export const accountingPaths = {
  '/accounting/settings': {
    get: {
      tags: ['Accounting'],
      summary: 'The conventions every ledger figure follows, with the tenant’s currency and time zone',
      description: 'Cost model; monthly periods in the tenant’s time zone; a full month in the start month and none in the '
        + 'disposal month (D15); half-up rounding to two places with the remainder in the last month (D14); preparer '
        + 'and approver must differ (D17). Needs `accounting:read`.',
      responses: { 200: { description: 'Ledger settings' }, 403: { description: 'No accounting:read' }, 404: notFoundWhenOff },
    },
  },
  '/accounting/classes': {
    get: {
      tags: ['Accounting'], summary: 'Asset classes with their IPSAS policies, GL accounts and usage (accounting:read)',
      responses: { 200: { description: 'Classes, with assetCount and categoryCount' }, 404: notFoundWhenOff },
    },
    post: {
      tags: ['Accounting'], summary: 'Create an asset class (accounting:write; audited)',
      description: 'Body: `assetClassSchema` in vairiot-shared (code, name, ipsasClass, capitalisationThreshold, defaults, GL accounts).',
      responses: { 201: { description: 'Created' }, 400: { description: 'Invalid' }, 409: { description: 'Code already used' }, 404: notFoundWhenOff },
    },
  },
  '/accounting/classes/{id}': {
    patch: {
      tags: ['Accounting'], summary: 'Change an asset class (accounting:write; audited). A new threshold is applied to its assets at once',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Updated' }, 400: { description: 'Invalid' }, 404: { description: 'No such class, or ipsas off' } },
    },
  },
  '/accounting/categories/{id}/class': {
    put: {
      tags: ['Accounting'], summary: 'Point a category at an asset class; its unclassified assets take it (accounting:write; audited)',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { assetClassId: { type: 'string', nullable: true } } } } } },
      responses: { 200: { description: 'Category' }, 400: { description: 'Unknown class' }, 404: { description: 'No such category, or ipsas off' } },
    },
  },
  '/accounting/assets/pending-review': {
    get: {
      tags: ['Accounting'], summary: 'Assets without a class or a cost, for Finance to resolve (D20; accounting:read)',
      responses: { 200: { description: 'Assets with reason no_class or no_cost' }, 404: notFoundWhenOff },
    },
  },
  '/accounting/assets/{id}/recognition': {
    put: {
      tags: ['Accounting'], summary: 'Override the threshold rule for an asset, with a reason, or clear the override (accounting:approve; audited)',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: {
        status: { type: 'string', enum: ['RECOGNISED', 'EXPENSED'], nullable: true }, reason: { type: 'string', minLength: 5 },
      } } } } },
      responses: { 200: { description: 'Asset' }, 400: { description: 'Invalid' }, 403: { description: 'No accounting:approve' }, 404: { description: 'No such asset, or ipsas off' } },
    },
  },
  '/accounting/assets/{id}/components': {
    get: {
      tags: ['Accounting'], summary: 'An asset with its components and the roll-up of cost, depreciation and NBV (S2.2; accounting:read)',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'asset, parent (for a component), components, rollUp' }, 404: { description: 'No such asset, or ipsas off' } },
    },
  },
  '/accounting/assets/{id}/parent': {
    put: {
      tags: ['Accounting'], summary: 'Attach an asset to a parent as a component, move it, or detach it with parentAssetId null (accounting:write and asset:write; audited)',
      description: 'One level only. A new component takes the parent’s site, location and position.',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Asset' }, 400: { description: 'Would nest components, or not this tenant’s' }, 404: { description: 'No such asset, or ipsas off' } },
    },
  },
  '/accounting/component-templates': {
    get: { tags: ['Accounting'], summary: 'Component templates (accounting:read)', responses: { 200: { description: 'Templates' }, 404: notFoundWhenOff } },
    post: {
      tags: ['Accounting'], summary: 'Create a component template (accounting:write; audited)',
      description: 'Body: `componentTemplateSchema` in vairiot-shared; cost shares add up to 100 % at most.',
      responses: { 201: { description: 'Created' }, 400: { description: 'Invalid' }, 409: { description: 'Code already used' }, 404: notFoundWhenOff },
    },
  },
  '/accounting/component-templates/{id}': {
    patch: { tags: ['Accounting'], summary: 'Change a component template (accounting:write; audited)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Updated' }, 404: { description: 'No such template, or ipsas off' } } },
  },
  '/accounting/component-templates/{id}/assets': {
    post: {
      tags: ['Accounting'], summary: 'Create an asset and its components from a template (accounting:write and asset:write)',
      description: 'Body: `instantiateTemplateSchema`. totalCost is split by the lines’ cost shares; the parent keeps the rest.',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 201: { description: 'The new group with its roll-up' }, 403: { description: 'Licence cap or permissions' }, 404: { description: 'No such template, or ipsas off' } },
    },
  },
  '/admin/platform/tenants/{id}/modules': {
    get: {
      tags: ['Platform'],
      summary: 'A tenant’s modules from the registry, with whether each is on',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Modules' }, 404: { description: 'No such tenant' } },
    },
  },
  '/admin/platform/tenants/{id}/modules/{key}': {
    put: {
      tags: ['Platform'],
      summary: 'Switch a module on or off for a tenant (Platform Super Admin; audited)',
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'key', in: 'path', required: true, schema: { type: 'string', enum: ['blindAudit', 'gis', 'ipsas', 'reconciliation'] } },
      ],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', required: ['enabled'], properties: { enabled: { type: 'boolean' } } } } },
      },
      responses: { 200: { description: 'Modules after the change' }, 400: { description: 'enabled is not a boolean' }, 404: { description: 'No such tenant or module' } },
    },
  },
};
