export const Permission = {
  // Assets
  AssetRead:      'asset:read',
  AssetWrite:     'asset:write',
  AssetDelete:    'asset:delete',

  // Taxonomy
  SiteRead:       'site:read',
  SiteWrite:      'site:write',
  CategoryRead:   'category:read',
  CategoryWrite:  'category:write',

  // Audit campaigns
  AuditRead:      'audit:read',
  AuditWrite:     'audit:write',

  // Scanning (RFID / barcode)
  ScanExecute:    'scan:execute',

  // Reports
  ReportRead:     'report:read',
  ReportExport:   'report:export',

  // Work orders / maintenance
  WorkOrderRead:  'workorder:read',
  WorkOrderWrite: 'workorder:write',
  WorkOrderAssigned: 'workorder:assigned',

  // Users & API keys
  UserRead:       'user:read',
  UserWrite:      'user:write',
  ApiKeyRead:     'apikey:read',
  ApiKeyWrite:    'apikey:write',

  // Company & client registration
  CompanyManage:  'company:manage',
  ClientRead:     'client:read',
  ClientManage:   'client:manage',

  // Licensing (platform plane only)
  LicenceManage:  'licence:manage',

  // System configuration
  SystemConfigure: 'system:configure',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

export const ALL_PERMISSIONS = Object.values(Permission);
