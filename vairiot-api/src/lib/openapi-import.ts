// OpenAPI paths of the staged register import (Phase 2, S2.5, stage 2.13).
// Each step answers 202 and the worker does the work; the batch's `status`
// (UPLOADED, PARSING, PARSED, VALIDATING, VALIDATED, COMMITTING, COMMITTED,
// FAILED, CANCELLED) and counts show its progress. Bodies are the Zod
// contracts in vairiot-shared (D19); the contract test checks every route
// here is documented.
const id = [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }];
const tags = ['Import'];
const accepted = { description: 'Accepted: the batch, with its working status' };
const xlsx = { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { schema: { type: 'string', format: 'binary' } } };
const mapping = {
  type: 'object', required: ['fields'],
  properties: {
    fields: { type: 'object', additionalProperties: { type: 'string' }, description: 'Target field (name, classCode, siteName, purchaseCost, financeRef, legacyAssetNumber, …) → the file’s column header' },
    transforms: {
      type: 'object',
      properties: {
        dateFormat: { type: 'string', enum: ['DMY', 'MDY', 'YMD'] }, decimalSeparator: { type: 'string', enum: ['.', ','] },
        lookups: { type: 'object', description: 'Per lookup field (classCode, siteName, categoryName, condition): the file’s value → the register’s' },
      },
    },
  },
};

export const importPaths = {
  '/imports': {
    get: { tags, summary: 'The latest 50 imports, newest first (asset:read)', responses: { 200: { description: 'Batches' } } },
    post: {
      tags, summary: 'Upload an .xlsx or .csv register of up to 25 MB and queue it to be read (asset:write; update mode also accounting:write, D16)',
      description: '.xls is refused (D18). The file is kept in MinIO.',
      requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' }, mode: { type: 'string', enum: ['CREATE', 'UPDATE'] } } } } } },
      responses: { 202: accepted, 400: { description: 'Not .xlsx or .csv, empty or over 25 MB' }, 403: { description: 'Update mode without accounting:write' } },
    },
  },
  '/imports/mappings': {
    get: { tags, summary: 'Mappings saved for reuse (asset:read)', responses: { 200: { description: 'Saved mappings' } } },
    put: {
      tags, summary: 'Save a mapping under a name, replacing one of the same name (asset:write)',
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'mapping'], properties: { name: { type: 'string' }, mapping } } } } },
      responses: { 200: { description: 'The saved mapping' }, 400: { description: 'Invalid' } },
    },
  },
  '/imports/{id}': { get: { tags, summary: 'A batch: status, columns, counts, mapping (asset:read)', parameters: id, responses: { 200: { description: 'Batch' }, 404: { description: 'Not found' } } } },
  '/imports/{id}/rows': {
    get: {
      tags, summary: 'Rows with their raw cells, mapped values, status and messages, a page at a time (asset:read)',
      parameters: [...id, { name: 'status', in: 'query', schema: { type: 'string', enum: ['PENDING', 'VALID', 'WARNING', 'ERROR', 'COMMITTED'] } }, { name: 'page', in: 'query', schema: { type: 'integer' } }, { name: 'pageSize', in: 'query', schema: { type: 'integer', maximum: 500 } }],
      responses: { 200: { description: 'rows, total, page, pageSize' } },
    },
  },
  '/imports/{id}/mapping': {
    put: {
      tags, summary: 'Set the mapping (or start from the profiler’s JSON) and queue the rows to be validated (asset:write)',
      description: 'Possible once the file is read and until it is committed. Validation checks required fields, lookups, dates and numbers, positions, duplicates in the file and against the register, and the class threshold.',
      parameters: id,
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { mapping, profile: { type: 'object', description: 'The JSON written by scripts/profile-register.py' }, mode: { type: 'string', enum: ['CREATE', 'UPDATE'] } } } } } },
      responses: { 202: accepted, 400: { description: 'Invalid, or a column the file does not have' }, 409: { description: 'NOT_MAPPABLE' } },
    },
  },
  '/imports/{id}/commit': {
    post: {
      tags, summary: 'Queue the VALID and WARNING rows to be written; ERROR rows are left out (asset:write; update mode also accounting:write)',
      description: 'The licence cap is checked for the whole batch first (KFR-039). Each row gets its FINANCE_REF and LEGACY_TAG identifiers and a MIGRATED event; update mode matches by FINANCE_REF and changes no asset number.',
      parameters: id, responses: { 202: accepted, 409: { description: 'NOT_VALIDATED or NOTHING_TO_COMMIT' } },
    },
  },
  '/imports/{id}/cancel': { post: { tags, summary: 'Cancel a batch not yet being committed (asset:write)', parameters: id, responses: { 200: { description: 'Cancelled' }, 409: { description: 'NOT_CANCELLABLE' } } } },
  '/imports/{id}/errors.xlsx': { get: { tags, summary: 'The ERROR rows as the file had them, with what to fix (asset:read)', parameters: id, responses: { 200: { description: 'Workbook', content: xlsx } } } },
  '/imports/{id}/reconciliation.xlsx': { get: { tags, summary: 'Each source row with the asset it became: asset number, GIAI, finance reference (asset:read)', parameters: id, responses: { 200: { description: 'Workbook', content: xlsx } } } },
};
