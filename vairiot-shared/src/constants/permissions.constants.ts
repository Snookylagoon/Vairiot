export const Permission = {
  AssetRead:    'asset:read',
  AssetWrite:   'asset:write',
  AssetDelete:  'asset:delete',
  SiteWrite:    'site:write',
  CategoryWrite:'category:write',
  AuditWrite:   'audit:write',
  UserRead:     'user:read',
  UserWrite:    'user:write',
  ApiKeyRead:   'apikey:read',
  ApiKeyWrite:  'apikey:write',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

export const ALL_PERMISSIONS = Object.values(Permission);
