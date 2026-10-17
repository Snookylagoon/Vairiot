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
      responses: { 200: { description: 'Asset' }, 202: { description: 'EXPENSED → RECOGNISED is capitalisation: waiting for approval when a rule covers it (S3.1), { approvalRequest }' }, 400: { description: 'Invalid' }, 403: { description: 'No accounting:approve' }, 404: { description: 'No such asset, or ipsas off' } },
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
  '/accounting/periods': {
    get: { tags: ['Accounting'], summary: 'Accounting periods with their runs, newest first (accounting:read)', responses: { 200: { description: 'Periods' }, 404: notFoundWhenOff } },
    post: {
      tags: ['Accounting'], summary: 'Open the period for a year and month (accounting:write); returns it if it exists',
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['year', 'month'], properties: { year: { type: 'integer' }, month: { type: 'integer', minimum: 1, maximum: 12 } } } } } },
      responses: { 201: { description: 'Period' }, 400: { description: 'Invalid' }, 404: notFoundWhenOff },
    },
  },
  '/accounting/periods/{id}/runs': {
    post: {
      tags: ['Accounting'], summary: 'Queue a draft depreciation run for the worker to preview (accounting:write)',
      description: 'The period must be open, with no posted run, no later period posted, and no job in flight. An earlier draft for the period is discarded. The worker fills in the preview; `jobState` on the run shows its progress.',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 202: { description: 'Draft run, jobState QUEUED' }, 409: { description: 'Not open, already posted, a later period posted, or RUN_BUSY' } },
    },
  },
  '/accounting/periods/{id}/reopen': { post: { tags: ['Accounting'], summary: 'Reopen a closed period (accounting:approve)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Period' }, 409: { description: 'Not closed, or locked' } } } },
  '/accounting/periods/{id}/lock': { post: { tags: ['Accounting'], summary: 'Lock a period for good (accounting:approve)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Period' }, 409: { description: 'Locked already, or a draft pending' } } } },
  '/accounting/periods/{id}/usage': {
    get: { tags: ['Accounting'], summary: 'Units-of-production assets with their usage for the period (accounting:read)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'id, assetNumber, name, expectedTotalUnits, units' } } },
    put: {
      tags: ['Accounting'], summary: 'Usage for many assets in an open period at once, all or nothing (accounting:write)',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['rows'], properties: { rows: { type: 'array', minItems: 1, maxItems: 2000, items: { type: 'object', required: ['assetId', 'units'], properties: { assetId: { type: 'string' }, units: { type: 'number', minimum: 0 } } } } } } } } },
      responses: { 200: { description: 'Usage rows' }, 400: { description: 'Invalid, or an asset twice' }, 404: { description: 'An asset not found' }, 409: { description: 'Period not open' } },
    },
  },
  '/accounting/periods/{id}/usage/{assetId}': {
    put: {
      tags: ['Accounting'], summary: 'Units an asset delivered in an open period, for units of production (accounting:write)',
      parameters: [...[{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], { name: 'assetId', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['units'], properties: { units: { type: 'number', minimum: 0 } } } } } },
      responses: { 200: { description: 'Usage' }, 409: { description: 'Period not open' } },
    },
  },
  '/accounting/runs/{id}/post': {
    post: {
      tags: ['Accounting'], summary: 'Queue a draft run for posting (accounting:approve; not by its preparer, D17); the worker writes the entries and closes the period',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 202: { description: 'Run, jobState QUEUED' }, 403: { description: 'Preparer cannot post' }, 409: { description: 'Not a draft, period not open, or out of order' } },
    },
  },
  '/accounting/runs/{id}/discard': { post: { tags: ['Accounting'], summary: 'Discard a draft run (accounting:write)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Run' }, 409: { description: 'Not a draft' } } } },
  '/accounting/runs/{id}/reverse': {
    post: {
      tags: ['Accounting'], summary: 'Queue the reversal of a posted run (accounting:approve); the worker writes the offsetting entries. The period must not be locked',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 202: { description: 'Run, jobState QUEUED' }, 409: { description: 'Not posted, locked, or a later period posted' } },
    },
  },
  '/accounting/assets/{id}/depreciation': {
    get: { tags: ['Accounting'], summary: 'An asset’s depreciation entries and carrying amount from the ledger (accounting:read)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Entries, accumulated, carrying amount' }, 404: { description: 'No such asset, or ipsas off' } } },
  },
  '/accounting/impairments': {
    get: { tags: ['Accounting'], summary: 'Impairments, newest first, by status or asset (accounting:read)', parameters: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['DRAFT', 'POSTED', 'REVERSED', 'DISMISSED'] } }, { name: 'assetId', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'Impairments with their asset and period' } } },
    post: {
      tags: ['Accounting'], summary: 'Raise an impairment indicator by hand as a DRAFT (accounting:write); a grade with impairmentIndicator raises one itself',
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['assetId', 'indicator'], properties: { assetId: { type: 'string' }, indicator: { type: 'string', enum: ['CONDITION', 'DAMAGE', 'OBSOLESCENCE', 'IDLE', 'LEGAL', 'OTHER'] }, indicatorNotes: { type: 'string', maxLength: 1000 } } } } } },
      responses: { 201: { description: 'Draft' }, 409: { description: 'NOT_RECOGNISED or DRAFT_EXISTS' } },
    },
  },
  '/accounting/impairments/{id}/assessment': {
    put: {
      tags: ['Accounting'], summary: 'Assess a draft (accounting:write): the standard, the measurement method and the recoverable amount',
      description: 'Below the carrying amount: an IMPAIRMENT of the difference. Above it with impairment outstanding: a REVERSAL, capped at the impairment outstanding and at the carrying amount the asset would have had unimpaired (IPSAS 21.68, 26.106); `loss` is negative.',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['standard', 'method', 'recoverableAmount'], properties: { standard: { type: 'string', enum: ['IPSAS_21', 'IPSAS_26'] }, method: { type: 'string', enum: ['DRC', 'RESTORATION_COST', 'SERVICE_UNITS', 'FVLCS'] }, recoverableAmount: { type: 'number', minimum: 0 }, assessmentNotes: { type: 'string' }, evidencePhotoIds: { type: 'array', items: { type: 'string' }, maxItems: 20 } } } } } },
      responses: { 200: { description: 'Assessed draft with kind, carryingAmount and loss' }, 409: { description: 'Not a draft' } },
    },
  },
  '/accounting/impairments/{id}/dismiss': { post: { tags: ['Accounting'], summary: 'Dismiss a draft: no impairment (accounting:write)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Dismissed' }, 409: { description: 'Not a draft' } } } },
  '/accounting/impairments/{id}/post': {
    post: {
      tags: ['Accounting'], summary: 'Post an assessed draft into an open period (accounting:approve; not by its assessor, D17); writes IMPAIRED on the asset ledger',
      description: 'The figures are worked out again; the period’s run is the first on the new base. No later period may have posted depreciation.',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['periodId'], properties: { periodId: { type: 'string' }, notes: { type: 'string', maxLength: 500 } } } } } },
      responses: { 200: { description: 'Posted' }, 403: { description: 'The assessor' }, 409: { description: 'NOT_ASSESSED, PERIOD_NOT_OPEN, LATER_PERIOD_POSTED, NO_LOSS, REASSESS or DISPOSED' } },
    },
  },
  '/accounting/impairments/{id}/correct': {
    post: {
      tags: ['Accounting'], summary: 'Correct a posted impairment with an offsetting record in an open period (accounting:approve); the original becomes REVERSED',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['periodId'], properties: { periodId: { type: 'string' }, notes: { type: 'string', maxLength: 500 } } } } } },
      responses: { 201: { description: 'The offsetting record' }, 409: { description: 'NOT_POSTED, NOT_LATEST or the period' } },
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
