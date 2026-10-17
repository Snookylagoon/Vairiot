// OpenAPI paths of the maker-checker approvals (Phase 3, S3.1, stage 3.2,
// D22). A request is made by the action's own route (dispose, transfer,
// audit adjustments, recognition), which answers 202 with it when a rule
// covers the action; here requests are listed and decided, and rules set.
const id = [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }];
const tags = ['Approvals'];
const reason = { type: 'object', properties: { reason: { type: 'string', maxLength: 1000 } } };

export const approvalPaths = {
  '/approvals': {
    get: {
      tags, summary: 'Approval requests, newest first, with whether the caller may decide each (approval:read)',
      parameters: [
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'FAILED'] } },
        { name: 'assetId', in: 'query', schema: { type: 'string' } }, { name: 'mine', in: 'query', schema: { type: 'boolean' } },
      ],
      responses: { 200: { description: 'Requests with the requester, the decider, the approver role and canDecide' } },
    },
  },
  '/approvals/inbox': {
    get: {
      tags, summary: 'What the caller may decide now: requests, and the ledger’s post steps (runs, impairments) prepared by someone else; with the count for the header badge',
      responses: { 200: { description: 'requests, runs, impairments, count' } },
    },
  },
  '/approvals/mine': { get: { tags, summary: 'The caller’s own requests', responses: { 200: { description: 'Requests' } } } },
  '/approvals/{id}/approve': {
    post: {
      tags, summary: 'Approve: the change is made through its own service (approval:decide, in the rule’s role, not the requester for disposal and write-off)',
      parameters: id, requestBody: { content: { 'application/json': { schema: reason } } },
      responses: { 200: { description: 'APPROVED with the result, or FAILED with why it could not be made' }, 403: { description: 'The requester, or another role' }, 409: { description: 'NOT_PENDING' } },
    },
  },
  '/approvals/{id}/reject': {
    post: {
      tags, summary: 'Reject with a reason (approval:decide); nothing changes',
      parameters: id, requestBody: { required: true, content: { 'application/json': { schema: { ...reason, required: ['reason'] } } } },
      responses: { 200: { description: 'REJECTED' }, 400: { description: 'No reason' }, 403: { description: 'Not allowed' }, 409: { description: 'NOT_PENDING' } },
    },
  },
  '/approvals/{id}/cancel': { post: { tags, summary: 'Withdraw one’s own pending request', parameters: id, responses: { 200: { description: 'CANCELLED' }, 403: { description: 'Someone else’s' }, 409: { description: 'NOT_PENDING' } } } },
  '/approvals/rules': {
    get: { tags, summary: 'The rules: per action, the amount from which approval is needed and the role that decides', responses: { 200: { description: 'Rules' } } },
    put: {
      tags, summary: 'Replace the rules (company:manage); removed tiers are deactivated, open requests keep theirs',
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['rules'], properties: { rules: { type: 'array', maxItems: 50, items: {
        type: 'object', required: ['action', 'minAmount', 'approverRoleId'],
        properties: {
          action: { type: 'string', enum: ['CAPITALISE', 'TRANSFER', 'DISPOSE', 'WRITE_OFF', 'REGISTER_NEW'] }, minAmount: { type: 'number', minimum: 0 },
          approverRoleId: { type: 'string', nullable: true }, requireDifferentUser: { type: 'boolean' }, active: { type: 'boolean' },
        },
      } } } } } } },
      responses: { 200: { description: 'Rules' }, 400: { description: 'Two tiers from one amount, or a self-approved disposal or write-off' }, 404: { description: 'A role from elsewhere' } },
    },
  },
};
