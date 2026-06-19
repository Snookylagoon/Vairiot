export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Vairiot Asset Management API',
    version: '1.0.0',
    description: 'Multi-tenant asset management platform API',
  },
  servers: [{ url: '/api/v1', description: 'API v1' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      apiKeyAuth: { type: 'http', scheme: 'bearer', description: 'API key prefixed with vai_' },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          code: { type: 'string' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password', 'tenantId'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          tenantId: { type: 'string' },
        },
      },
      AuthTokens: {
        type: 'object',
        properties: {
          accessToken: { type: 'string' },
          refreshToken: { type: 'string' },
          expiresIn: { type: 'string' },
        },
      },
      UserProfile: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          email: { type: 'string' },
          tenantId: { type: 'string' },
          roles: { type: 'array', items: { type: 'string' } },
          permissions: { type: 'array', items: { type: 'string' } },
        },
      },
      Asset: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          tenantId: { type: 'string' },
          assetNumber: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string', nullable: true },
          categoryId: { type: 'string', nullable: true },
          siteId: { type: 'string', nullable: true },
          locationId: { type: 'string', nullable: true },
          status: { type: 'string', enum: ['active', 'inactive', 'in_use', 'maintenance', 'disposed'] },
          condition: { type: 'string', enum: ['new', 'good', 'fair', 'poor', 'damaged'] },
          serialNumber: { type: 'string', nullable: true },
          modelNumber: { type: 'string', nullable: true },
          manufacturer: { type: 'string', nullable: true },
          barcode: { type: 'string', nullable: true },
          rfidTag: { type: 'string', nullable: true },
          purchaseDate: { type: 'string', format: 'date', nullable: true },
          purchaseCost: { type: 'string', nullable: true },
          supplier: { type: 'string', nullable: true },
          purchaseOrderNumber: { type: 'string', nullable: true },
          invoiceNumber: { type: 'string', nullable: true },
          invoiceDate: { type: 'string', format: 'date', nullable: true },
          receiptDate: { type: 'string', format: 'date', nullable: true },
          capitalizationDate: { type: 'string', format: 'date', nullable: true },
          freightCost: { type: 'string', nullable: true },
          installationCost: { type: 'string', nullable: true },
          customsDuties: { type: 'string', nullable: true },
          otherCapitalizedCosts: { type: 'string', nullable: true },
          residualValue: { type: 'string', nullable: true },
          depreciationMethod: { type: 'string', nullable: true },
          usefulLifeMonths: { type: 'integer', nullable: true },
          depreciationStartDate: { type: 'string', format: 'date', nullable: true },
          warrantyExpiry: { type: 'string', format: 'date', nullable: true },
          notes: { type: 'string', nullable: true },
          customFields: { type: 'object', nullable: true },
          deletedAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          depreciation: { $ref: '#/components/schemas/Depreciation' },
        },
      },
      AssetCreate: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          categoryId: { type: 'string' },
          siteId: { type: 'string' },
          locationId: { type: 'string' },
          status: { type: 'string' },
          condition: { type: 'string' },
          serialNumber: { type: 'string' },
          modelNumber: { type: 'string' },
          manufacturer: { type: 'string' },
          barcode: { type: 'string' },
          rfidTag: { type: 'string' },
          purchaseDate: { type: 'string', format: 'date' },
          purchaseCost: { type: 'number' },
          supplier: { type: 'string' },
          warrantyExpiry: { type: 'string', format: 'date' },
          notes: { type: 'string' },
          customFields: { type: 'object' },
          depreciationMethod: { type: 'string' },
          usefulLifeMonths: { type: 'integer' },
          residualValue: { type: 'number' },
        },
      },
      Depreciation: {
        type: 'object',
        properties: {
          capitalizedCost: { type: 'number' },
          monthlyDepreciation: { type: 'number' },
          accumulatedDepreciation: { type: 'number' },
          netBookValue: { type: 'number' },
        },
      },
      AssetList: {
        type: 'object',
        properties: {
          data: { type: 'array', items: { $ref: '#/components/schemas/Asset' } },
          total: { type: 'integer' },
          page: { type: 'integer' },
          pageSize: { type: 'integer' },
        },
      },
      Category: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          tenantId: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string', nullable: true },
          parentId: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Site: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          tenantId: { type: 'string' },
          name: { type: 'string' },
          address: { type: 'string', nullable: true },
          city: { type: 'string', nullable: true },
          country: { type: 'string', nullable: true },
          active: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Location: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          siteId: { type: 'string' },
          name: { type: 'string' },
          type: { type: 'string' },
          parentId: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Checkout: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          tenantId: { type: 'string' },
          assetId: { type: 'string' },
          custodianId: { type: 'string' },
          checkedOutBy: { type: 'string' },
          checkedInBy: { type: 'string', nullable: true },
          expectedReturn: { type: 'string', format: 'date-time', nullable: true },
          checkedOutAt: { type: 'string', format: 'date-time' },
          checkedInAt: { type: 'string', format: 'date-time', nullable: true },
          notes: { type: 'string', nullable: true },
        },
      },
      MaintenanceEvent: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          tenantId: { type: 'string' },
          assetId: { type: 'string' },
          maintenanceType: { type: 'string' },
          vendor: { type: 'string', nullable: true },
          workOrderNumber: { type: 'string', nullable: true },
          cost: { type: 'string', nullable: true },
          description: { type: 'string', nullable: true },
          scheduledDate: { type: 'string', format: 'date-time', nullable: true },
          completedDate: { type: 'string', format: 'date-time', nullable: true },
          status: { type: 'string', enum: ['scheduled', 'in_progress', 'completed', 'cancelled'] },
          notes: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      AuditCampaign: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          tenantId: { type: 'string' },
          name: { type: 'string' },
          siteId: { type: 'string', nullable: true },
          locationId: { type: 'string', nullable: true },
          status: { type: 'string', enum: ['draft', 'in_progress', 'completed'] },
          scheduledAt: { type: 'string', format: 'date-time', nullable: true },
          startedAt: { type: 'string', format: 'date-time', nullable: true },
          completedAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      AlertSubscription: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          tenantId: { type: 'string' },
          userId: { type: 'string' },
          exceptionType: { type: 'string' },
          channel: { type: 'string' },
          frequency: { type: 'string' },
          active: { type: 'boolean' },
          lastSentAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Webhook: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          tenantId: { type: 'string' },
          name: { type: 'string' },
          url: { type: 'string' },
          events: { type: 'array', items: { type: 'string' } },
          active: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CustomFieldDefinition: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          tenantId: { type: 'string' },
          name: { type: 'string' },
          label: { type: 'string' },
          fieldType: { type: 'string' },
          required: { type: 'boolean' },
          options: { type: 'array', items: { type: 'string' } },
          sortOrder: { type: 'integer' },
          active: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Transfer: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          tenantId: { type: 'string' },
          assetId: { type: 'string' },
          fromSiteId: { type: 'string', nullable: true },
          toSiteId: { type: 'string', nullable: true },
          fromLocationId: { type: 'string', nullable: true },
          toLocationId: { type: 'string', nullable: true },
          fromCustodian: { type: 'string', nullable: true },
          toCustodian: { type: 'string', nullable: true },
          transferDate: { type: 'string', format: 'date-time' },
          reason: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
    responses: {
      Unauthorized: { description: 'Missing or invalid authentication', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      Forbidden: { description: 'Insufficient permissions', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      NotFound: { description: 'Resource not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    },
  },
  security: [{ bearerAuth: [] }],
  tags: [
    { name: 'Auth', description: 'Authentication and session management' },
    { name: 'Assets', description: 'Asset CRUD and search' },
    { name: 'Categories', description: 'Asset category management' },
    { name: 'Sites', description: 'Sites and locations' },
    { name: 'Checkouts', description: 'Asset check-in / check-out' },
    { name: 'Maintenance', description: 'Maintenance events' },
    { name: 'Audits', description: 'Physical audit campaigns' },
    { name: 'Reports', description: 'Financial and operational reports' },
    { name: 'Transfers', description: 'Asset transfers' },
    { name: 'Exceptions', description: 'Asset exceptions and anomalies' },
    { name: 'Timeline', description: 'Asset lifecycle timeline' },
    { name: 'Alerts', description: 'Alert subscriptions' },
    { name: 'Webhooks', description: 'Webhook management' },
    { name: 'Custom Fields', description: 'Custom field definitions' },
    { name: 'Admin', description: 'User, role, API key, and audit log management' },
    { name: 'Documents', description: 'Asset document attachments' },
    { name: 'Photos', description: 'Asset photo attachments' },
    { name: 'Health', description: 'Health and readiness checks' },
  ],
  paths: {
    // ── Auth ──
    '/auth/login': {
      post: {
        tags: ['Auth'], summary: 'Log in', security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } } },
        responses: { 200: { description: 'JWT tokens', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthTokens' } } } }, 400: { description: 'Validation error' }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'], summary: 'Refresh tokens', security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['refreshToken'], properties: { refreshToken: { type: 'string' } } } } } },
        responses: { 200: { description: 'New token pair', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthTokens' } } } } },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'], summary: 'Get current user profile',
        responses: { 200: { description: 'User profile', content: { 'application/json': { schema: { $ref: '#/components/schemas/UserProfile' } } } } },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'], summary: 'Log out and blacklist tokens',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { refreshToken: { type: 'string' } } } } } },
        responses: { 200: { description: 'Logged out' } },
      },
    },
    // ── Assets ──
    '/assets': {
      get: {
        tags: ['Assets'], summary: 'List assets (paginated)',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 50, maximum: 200 } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'categoryId', in: 'query', schema: { type: 'string' } },
          { name: 'siteId', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'condition', in: 'query', schema: { type: 'string' } },
          { name: 'sortBy', in: 'query', schema: { type: 'string' } },
          { name: 'sortOrder', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
          { name: 'includeDeleted', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: { 200: { description: 'Paginated asset list', content: { 'application/json': { schema: { $ref: '#/components/schemas/AssetList' } } } } },
      },
      post: {
        tags: ['Assets'], summary: 'Create an asset',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AssetCreate' } } } },
        responses: { 201: { description: 'Created asset', content: { 'application/json': { schema: { $ref: '#/components/schemas/Asset' } } } }, 400: { description: 'Validation error' } },
      },
    },
    '/assets/stats': {
      get: {
        tags: ['Assets'], summary: 'Dashboard statistics',
        responses: { 200: { description: 'Asset stats including counts, values, trends' } },
      },
    },
    '/assets/export.csv': {
      get: {
        tags: ['Assets'], summary: 'Export assets as CSV',
        parameters: [
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'categoryId', in: 'query', schema: { type: 'string' } },
          { name: 'siteId', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'condition', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'CSV file', content: { 'text/csv': { schema: { type: 'string' } } } } },
      },
    },
    '/assets/import': {
      post: {
        tags: ['Assets'], summary: 'Bulk import assets from CSV rows',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['rows'], properties: { rows: { type: 'array', items: { type: 'object' }, minItems: 1 } } } } } },
        responses: { 200: { description: 'Import results' } },
      },
    },
    '/assets/tag/{tag}': {
      get: {
        tags: ['Assets'], summary: 'Look up asset by barcode or RFID tag',
        parameters: [{ name: 'tag', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Asset', content: { 'application/json': { schema: { $ref: '#/components/schemas/Asset' } } } }, 404: { $ref: '#/components/responses/NotFound' } },
      },
    },
    '/assets/{id}': {
      get: {
        tags: ['Assets'], summary: 'Get asset by ID',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Asset', content: { 'application/json': { schema: { $ref: '#/components/schemas/Asset' } } } }, 404: { $ref: '#/components/responses/NotFound' } },
      },
      patch: {
        tags: ['Assets'], summary: 'Update an asset',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AssetCreate' } } } },
        responses: { 200: { description: 'Updated asset', content: { 'application/json': { schema: { $ref: '#/components/schemas/Asset' } } } } },
      },
      delete: {
        tags: ['Assets'], summary: 'Soft-delete an asset',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 204: { description: 'Deleted' } },
      },
    },
    '/assets/{id}/dispose': {
      post: {
        tags: ['Assets'], summary: 'Dispose of an asset',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['disposalDate', 'disposalMethod'], properties: { disposalDate: { type: 'string', format: 'date' }, disposalMethod: { type: 'string', enum: ['sale', 'donation', 'recycled', 'scrapped', 'trade_in', 'write_off'] }, disposalValue: { type: 'number' }, disposalReason: { type: 'string' }, approvedBy: { type: 'string' }, notes: { type: 'string' } } } } } },
        responses: { 200: { description: 'Disposed asset', content: { 'application/json': { schema: { $ref: '#/components/schemas/Asset' } } } } },
      },
    },
    // ── Categories ──
    '/categories': {
      get: { tags: ['Categories'], summary: 'List categories', responses: { 200: { description: 'Category list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Category' } } } } } } },
      post: {
        tags: ['Categories'], summary: 'Create a category',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, description: { type: 'string' }, parentId: { type: 'string' } } } } } },
        responses: { 201: { description: 'Created category' } },
      },
    },
    '/categories/{id}': {
      patch: {
        tags: ['Categories'], summary: 'Update a category',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, parentId: { type: 'string' } } } } } },
        responses: { 200: { description: 'Updated category' } },
      },
      delete: { tags: ['Categories'], summary: 'Delete a category', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 204: { description: 'Deleted' } } },
    },
    // ── Sites ──
    '/sites': {
      get: { tags: ['Sites'], summary: 'List sites', responses: { 200: { description: 'Site list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Site' } } } } } } },
      post: {
        tags: ['Sites'], summary: 'Create a site',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, address: { type: 'string' }, city: { type: 'string' }, country: { type: 'string' } } } } } },
        responses: { 201: { description: 'Created site' } },
      },
    },
    '/sites/{siteId}': {
      delete: { tags: ['Sites'], summary: 'Delete a site', parameters: [{ name: 'siteId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 204: { description: 'Deleted' }, 409: { description: 'Site has assets' } } },
    },
    '/sites/{siteId}/locations': {
      get: { tags: ['Sites'], summary: 'List locations for a site', parameters: [{ name: 'siteId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Location list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Location' } } } } } } },
      post: {
        tags: ['Sites'], summary: 'Create a location',
        parameters: [{ name: 'siteId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, type: { type: 'string' }, parentId: { type: 'string' } } } } } },
        responses: { 201: { description: 'Created location' } },
      },
    },
    // ── Checkouts ──
    '/checkouts': {
      get: { tags: ['Checkouts'], summary: 'List active checkouts', responses: { 200: { description: 'Checkout list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Checkout' } } } } } } },
      post: {
        tags: ['Checkouts'], summary: 'Check out an asset',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['assetId', 'custodianId'], properties: { assetId: { type: 'string' }, custodianId: { type: 'string' }, expectedReturn: { type: 'string', format: 'date-time' }, notes: { type: 'string' } } } } } },
        responses: { 200: { description: 'Checkout record' }, 409: { description: 'Asset already checked out' } },
      },
    },
    '/checkouts/overdue': {
      get: { tags: ['Checkouts'], summary: 'List overdue checkouts', responses: { 200: { description: 'Overdue checkout list' } } },
    },
    '/checkouts/{assetId}/checkin': {
      post: { tags: ['Checkouts'], summary: 'Check in an asset', parameters: [{ name: 'assetId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Updated checkout record' }, 409: { description: 'Asset not checked out' } } },
    },
    '/checkouts/{assetId}/history': {
      get: { tags: ['Checkouts'], summary: 'Checkout history for an asset', parameters: [{ name: 'assetId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Checkout history' } } },
    },
    // ── Maintenance ──
    '/maintenance': {
      get: { tags: ['Maintenance'], summary: 'List maintenance events', responses: { 200: { description: 'Maintenance list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/MaintenanceEvent' } } } } } } },
      post: {
        tags: ['Maintenance'], summary: 'Create a maintenance event',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['assetId', 'maintenanceType'], properties: { assetId: { type: 'string' }, maintenanceType: { type: 'string' }, vendor: { type: 'string' }, cost: { type: 'number' }, description: { type: 'string' }, scheduledDate: { type: 'string', format: 'date' }, notes: { type: 'string' } } } } } },
        responses: { 201: { description: 'Created maintenance event' } },
      },
    },
    '/maintenance/{id}': {
      get: { tags: ['Maintenance'], summary: 'Get maintenance event', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Maintenance event' } } },
      patch: { tags: ['Maintenance'], summary: 'Update maintenance event', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated' } } },
      delete: { tags: ['Maintenance'], summary: 'Delete maintenance event', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 204: { description: 'Deleted' } } },
    },
    // ── Audits ──
    '/audits': {
      get: { tags: ['Audits'], summary: 'List audit campaigns', responses: { 200: { description: 'Campaign list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/AuditCampaign' } } } } } } },
      post: {
        tags: ['Audits'], summary: 'Create an audit campaign',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, siteId: { type: 'string' }, locationId: { type: 'string' }, scheduledAt: { type: 'string', format: 'date-time' } } } } } },
        responses: { 201: { description: 'Created campaign' } },
      },
    },
    '/audits/{id}/start': { post: { tags: ['Audits'], summary: 'Start an audit campaign', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Started' } } } },
    '/audits/{id}/scans': { post: { tags: ['Audits'], summary: 'Record a scan event', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['tagValue'], properties: { tagValue: { type: 'string' }, deviceId: { type: 'string' } } } } } }, responses: { 200: { description: 'Scan recorded' } } } },
    '/audits/{id}/complete': { post: { tags: ['Audits'], summary: 'Complete an audit campaign', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Completed' } } } },
    '/audits/{id}/export.csv': { get: { tags: ['Audits'], summary: 'Export audit results as CSV', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'CSV file', content: { 'text/csv': { schema: { type: 'string' } } } } } } },
    '/audits/{id}/report': { get: { tags: ['Audits'], summary: 'Get audit report summary', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Audit report' } } } },
    // ── Reports ──
    '/reports/depreciation': { get: { tags: ['Reports'], summary: 'Depreciation schedule report', responses: { 200: { description: 'Depreciation data' } } } },
    '/reports/fixed-assets': { get: { tags: ['Reports'], summary: 'Fixed assets register', responses: { 200: { description: 'Fixed assets data' } } } },
    '/reports/disposals': { get: { tags: ['Reports'], summary: 'Disposals report', responses: { 200: { description: 'Disposals data' } } } },
    '/reports/aging': { get: { tags: ['Reports'], summary: 'Asset aging analysis', responses: { 200: { description: 'Aging data' } } } },
    '/reports/maintenance-costs': { get: { tags: ['Reports'], summary: 'Maintenance cost analysis', responses: { 200: { description: 'Maintenance cost data' } } } },
    // ── Transfers ──
    '/transfers': {
      get: { tags: ['Transfers'], summary: 'List transfers', responses: { 200: { description: 'Transfer list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Transfer' } } } } } } },
      post: {
        tags: ['Transfers'], summary: 'Create a transfer',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['assetId'], properties: { assetId: { type: 'string' }, toSiteId: { type: 'string' }, toLocationId: { type: 'string' }, toCustodian: { type: 'string' }, reason: { type: 'string' } } } } } },
        responses: { 200: { description: 'Transfer record' } },
      },
    },
    // ── Exceptions ──
    '/exceptions': { get: { tags: ['Exceptions'], summary: 'List asset exceptions', responses: { 200: { description: 'Exception list' } } } },
    // ── Timeline ──
    '/timeline/{assetId}': { get: { tags: ['Timeline'], summary: 'Asset lifecycle timeline', parameters: [{ name: 'assetId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Timeline events' } } } },
    // ── Alerts ──
    '/alerts/subscriptions': {
      get: { tags: ['Alerts'], summary: 'List alert subscriptions', responses: { 200: { description: 'Subscription list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/AlertSubscription' } } } } } } },
      post: {
        tags: ['Alerts'], summary: 'Create alert subscription',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['exceptionType'], properties: { exceptionType: { type: 'string' }, channel: { type: 'string', default: 'email' }, frequency: { type: 'string', default: 'daily' } } } } } },
        responses: { 200: { description: 'Created subscription' } },
      },
    },
    '/alerts/subscriptions/{type}/toggle': {
      patch: { tags: ['Alerts'], summary: 'Toggle alert subscription', parameters: [{ name: 'type', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Toggled' } } },
    },
    '/alerts/subscriptions/{type}': {
      delete: { tags: ['Alerts'], summary: 'Delete alert subscription', parameters: [{ name: 'type', in: 'path', required: true, schema: { type: 'string' } }], responses: { 204: { description: 'Deleted' } } },
    },
    // ── Webhooks ──
    '/webhooks': {
      get: { tags: ['Webhooks'], summary: 'List webhooks', responses: { 200: { description: 'Webhook list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Webhook' } } } } } } },
      post: {
        tags: ['Webhooks'], summary: 'Create a webhook',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'url', 'events'], properties: { name: { type: 'string' }, url: { type: 'string', format: 'uri' }, events: { type: 'array', items: { type: 'string' } }, secret: { type: 'string' } } } } } },
        responses: { 201: { description: 'Created webhook' } },
      },
    },
    '/webhooks/events': { get: { tags: ['Webhooks'], summary: 'List available webhook event types', responses: { 200: { description: 'Event type list' } } } },
    '/webhooks/{id}/toggle': { patch: { tags: ['Webhooks'], summary: 'Toggle webhook active state', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Toggled' } } } },
    '/webhooks/{id}': { delete: { tags: ['Webhooks'], summary: 'Delete a webhook', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 204: { description: 'Deleted' } } } },
    // ── Custom Fields ──
    '/custom-fields': {
      get: { tags: ['Custom Fields'], summary: 'List custom field definitions', responses: { 200: { description: 'Field list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/CustomFieldDefinition' } } } } } } },
      post: {
        tags: ['Custom Fields'], summary: 'Create a custom field',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'label', 'fieldType'], properties: { name: { type: 'string' }, label: { type: 'string' }, fieldType: { type: 'string', enum: ['text', 'number', 'date', 'select', 'boolean'] }, required: { type: 'boolean' }, options: { type: 'array', items: { type: 'string' } } } } } } },
        responses: { 201: { description: 'Created field' } },
      },
    },
    '/custom-fields/{id}': {
      patch: { tags: ['Custom Fields'], summary: 'Update a custom field', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated' } } },
      delete: { tags: ['Custom Fields'], summary: 'Delete a custom field', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 204: { description: 'Deleted' } } },
    },
    // ── Photos ──
    '/assets/{assetId}/photos': {
      get: { tags: ['Photos'], summary: 'List photos for an asset', parameters: [{ name: 'assetId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Photo list' } } },
      post: { tags: ['Photos'], summary: 'Upload a photo', parameters: [{ name: 'assetId', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, caption: { type: 'string' } } } } } }, responses: { 201: { description: 'Uploaded photo' } } },
    },
    '/photos/{id}/download': { get: { tags: ['Photos'], summary: 'Download a photo', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Photo binary' } } } },
    '/photos/{id}': {
      patch: { tags: ['Photos'], summary: 'Update photo metadata', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { caption: { type: 'string' } } } } } }, responses: { 200: { description: 'Updated' } } },
      delete: { tags: ['Photos'], summary: 'Delete a photo', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 204: { description: 'Deleted' } } },
    },
    // ── Documents ──
    '/assets/{assetId}/documents': {
      get: { tags: ['Documents'], summary: 'List documents for an asset', parameters: [{ name: 'assetId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Document list' } } },
      post: { tags: ['Documents'], summary: 'Upload a document', parameters: [{ name: 'assetId', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, documentType: { type: 'string' }, notes: { type: 'string' } } } } } }, responses: { 201: { description: 'Uploaded document' } } },
    },
    '/documents/{id}/download': { get: { tags: ['Documents'], summary: 'Download a document', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Document binary' } } } },
    '/documents/{id}': { delete: { tags: ['Documents'], summary: 'Delete a document', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 204: { description: 'Deleted' } } } },
    // ── Admin: Users ──
    '/users': {
      get: { tags: ['Admin'], summary: 'List users', responses: { 200: { description: 'User list' } } },
      post: { tags: ['Admin'], summary: 'Create a user', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email', 'name', 'password'], properties: { email: { type: 'string' }, name: { type: 'string' }, password: { type: 'string' }, roleId: { type: 'string' } } } } } }, responses: { 201: { description: 'Created user' } } },
    },
    '/users/roles': { get: { tags: ['Admin'], summary: 'List roles', responses: { 200: { description: 'Role list' } } } },
    '/users/{userId}/active': { patch: { tags: ['Admin'], summary: 'Toggle user active status', parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['active'], properties: { active: { type: 'boolean' } } } } } }, responses: { 200: { description: 'Updated' } } } },
    '/users/{userId}/role': { patch: { tags: ['Admin'], summary: 'Change user role', parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['roleId'], properties: { roleId: { type: 'string' } } } } } }, responses: { 200: { description: 'Updated' } } } },
    // ── Admin: API Keys ──
    '/api-keys': {
      get: { tags: ['Admin'], summary: 'List API keys', responses: { 200: { description: 'API key list' } } },
      post: { tags: ['Admin'], summary: 'Create an API key', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'scopes'], properties: { name: { type: 'string' }, scopes: { type: 'array', items: { type: 'string' } } } } } } }, responses: { 201: { description: 'Created API key with plaintext key (shown only once)' } } },
    },
    '/api-keys/{keyId}': { delete: { tags: ['Admin'], summary: 'Revoke an API key', parameters: [{ name: 'keyId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 204: { description: 'Revoked' } } } },
    // ── Admin: Audit Log ──
    '/audit-events': {
      get: { tags: ['Admin'], summary: 'List audit events', parameters: [{ name: 'entityType', in: 'query', schema: { type: 'string' } }, { name: 'entityId', in: 'query', schema: { type: 'string' } }, { name: 'page', in: 'query', schema: { type: 'integer' } }, { name: 'pageSize', in: 'query', schema: { type: 'integer' } }], responses: { 200: { description: 'Audit event list' } } },
    },
    '/audit-events/export.csv': { get: { tags: ['Admin'], summary: 'Export audit log as CSV', responses: { 200: { description: 'CSV file', content: { 'text/csv': { schema: { type: 'string' } } } } } } },
  },
} as const;
