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

  // GS1 identification (prefix + identification admin, tag commissioning,
  // device/block management)
  Gs1Admin:       'gs1:admin',
  TagCommission:  'tag:commission',
  DeviceManage:   'device:manage',

  // IPSAS ledger: classes, periods, depreciation, impairment (D16, Phase 2).
  // Write prepares; approve posts, reverses, locks and overrides recognition.
  // Preparer and approver must be different users (D17).
  AccountingRead:    'accounting:read',
  AccountingWrite:   'accounting:write',
  AccountingApprove: 'accounting:approve',

  // Maker-checker approvals (S3.1, D22): read sees the inbox; decide
  // approves or rejects, for the actions whose rule names one of the
  // user's roles (or any action whose rule names none).
  ApprovalRead:   'approval:read',
  ApprovalDecide: 'approval:decide',

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
