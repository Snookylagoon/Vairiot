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
