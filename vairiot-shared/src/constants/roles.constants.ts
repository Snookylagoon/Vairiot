import { Permission } from './permissions.constants.js';

// ─── Control Planes ──────────────────────────────────────────────────────────
export const ControlPlane = {
  Platform: 'platform',
  Tenant:   'tenant',
  Client:   'client',
} as const;
export type ControlPlane = (typeof ControlPlane)[keyof typeof ControlPlane];

// ─── Role Names ──────────────────────────────────────────────────────────────
export const RoleName = {
  // Platform plane (Vairiot vendor)
  LicensingAuthority: 'Licensing Authority',
  PlatformSuperAdmin: 'Platform Super Admin',

  // Tenant plane (customer company)
  CompanyAdmin:        'Company Admin',
  AssetManager:        'Asset Manager',
  MaintenanceManager:  'Maintenance Manager',
  MaintenanceTechnician: 'Maintenance Technician',
  DataCollector:       'Data Collector',
  Auditor:             'Auditor',
  Viewer:              'Viewer',

  // Client plane (external)
  ClientStakeholder:   'Client Stakeholder',
  ClientAuthority:     'Client Authority',
} as const;
export type RoleName = (typeof RoleName)[keyof typeof RoleName];

export const ALL_ROLE_NAMES = Object.values(RoleName);

// ─── Roles that require mandatory TOTP 2FA (decision D6, stage 1.18) ─────────
// Administrators of a tenant and of the platform. Each user gets a grace
// period (TWO_FA_GRACE_DAYS, default 14) from the first sign-in after the
// requirement applies; after it, sign-in goes through enrolment. Field
// roles are excluded: crews share scanners. "Administrator" is the tenant
// role name the TUDA seed uses; "Company Admin" the self-registration one.
export const ROLES_REQUIRING_2FA: readonly string[] = [
  RoleName.PlatformSuperAdmin,
  RoleName.LicensingAuthority,
  RoleName.CompanyAdmin,
  'Administrator',
];

export const TWO_FA_GRACE_DAYS_DEFAULT = 14;

// ─── Platform-level roles (not scoped to a single tenant) ────────────────────
export const PLATFORM_ROLES: RoleName[] = [
  RoleName.LicensingAuthority,
  RoleName.PlatformSuperAdmin,
];

// ─── Client-scoped roles ─────────────────────────────────────────────────────
export const CLIENT_ROLES: RoleName[] = [
  RoleName.ClientStakeholder,
  RoleName.ClientAuthority,
];

// ─── Role → Permission Matrix ────────────────────────────────────────────────
// Single source of truth. The server reads this at boot; the web app uses it
// for UI hiding (presentation only — never a security boundary).

export interface RoleDefinition {
  name: RoleName;
  plane: ControlPlane;
  permissions: Permission[];
  isSystem: boolean;
}

const P = Permission;

export const ROLE_PERMISSION_MATRIX: RoleDefinition[] = [
  // ── Platform Plane ────────────────────────────────────────────────────────

  {
    name: RoleName.LicensingAuthority,
    plane: ControlPlane.Platform,
    isSystem: true,
    permissions: [
      P.LicenceManage,
      P.UserRead,
      P.ReportRead,
    ],
  },

  {
    name: RoleName.PlatformSuperAdmin,
    plane: ControlPlane.Platform,
    isSystem: true,
    permissions: [
      P.AssetRead, P.AssetWrite, P.AssetDelete,
      P.SiteRead, P.SiteWrite,
      P.CategoryRead, P.CategoryWrite,
      P.AuditRead, P.AuditWrite,
      P.ScanExecute,
      P.ReportRead, P.ReportExport,
      P.WorkOrderRead, P.WorkOrderWrite,
      P.UserRead, P.UserWrite,
      P.ApiKeyRead, P.ApiKeyWrite,
      P.CompanyManage,
      P.ClientRead, P.ClientManage,
      P.SystemConfigure,
      P.Gs1Admin, P.TagCommission, P.DeviceManage,
      P.AccountingRead, P.AccountingWrite, P.AccountingApprove,
    ],
  },

  // ── Tenant Plane ──────────────────────────────────────────────────────────

  {
    name: RoleName.CompanyAdmin,
    plane: ControlPlane.Tenant,
    isSystem: true,
    permissions: [
      P.AssetRead, P.AssetWrite, P.AssetDelete,
      P.SiteRead, P.SiteWrite,
      P.CategoryRead, P.CategoryWrite,
      P.AuditRead,
      P.ReportRead, P.ReportExport,
      P.WorkOrderRead,
      P.UserRead, P.UserWrite,
      P.ApiKeyRead, P.ApiKeyWrite,
      P.CompanyManage,
      P.ClientRead, P.ClientManage,
      P.Gs1Admin, P.TagCommission, P.DeviceManage,
      P.AccountingRead, P.AccountingWrite, P.AccountingApprove,
    ],
  },

  {
    name: RoleName.AssetManager,
    plane: ControlPlane.Tenant,
    isSystem: true,
    permissions: [
      P.AssetRead, P.AssetWrite, P.AssetDelete,
      P.SiteRead, P.SiteWrite,
      P.CategoryRead, P.CategoryWrite,
      P.AuditRead,
      P.ScanExecute,
      P.ReportRead, P.ReportExport,
      P.WorkOrderRead,
      P.TagCommission, P.DeviceManage,
      P.AccountingRead,
    ],
  },

  {
    name: RoleName.MaintenanceManager,
    plane: ControlPlane.Tenant,
    isSystem: true,
    permissions: [
      P.AssetRead,
      P.SiteRead,
      P.CategoryRead,
      P.ReportRead, P.ReportExport,
      P.WorkOrderRead, P.WorkOrderWrite,
    ],
  },

  {
    name: RoleName.MaintenanceTechnician,
    plane: ControlPlane.Tenant,
    isSystem: true,
    permissions: [
      P.AssetRead,
      P.SiteRead,
      P.CategoryRead,
      P.WorkOrderRead, P.WorkOrderAssigned,
    ],
  },

  {
    name: RoleName.DataCollector,
    plane: ControlPlane.Tenant,
    isSystem: true,
    permissions: [
      P.AssetRead,
      P.SiteRead,
      P.CategoryRead,
      P.ScanExecute,
      P.TagCommission,
    ],
  },

  {
    name: RoleName.Auditor,
    plane: ControlPlane.Tenant,
    isSystem: true,
    permissions: [
      P.AssetRead,
      P.SiteRead,
      P.CategoryRead,
      P.AuditRead, P.AuditWrite,
      P.ScanExecute,
      P.ReportRead, P.ReportExport,
      P.AccountingRead,
    ],
  },

  {
    name: RoleName.Viewer,
    plane: ControlPlane.Tenant,
    isSystem: true,
    permissions: [
      P.AssetRead,
      P.SiteRead,
      P.CategoryRead,
      P.ReportRead,
    ],
  },

  // ── Client Plane ──────────────────────────────────────────────────────────

  {
    name: RoleName.ClientStakeholder,
    plane: ControlPlane.Client,
    isSystem: true,
    permissions: [
      P.AssetRead,
      P.SiteRead,
      P.CategoryRead,
      P.ReportRead,
      P.ClientRead,
    ],
  },

  {
    name: RoleName.ClientAuthority,
    plane: ControlPlane.Client,
    isSystem: true,
    permissions: [
      P.AssetRead,
      P.SiteRead,
      P.CategoryRead,
      P.ReportRead,
      P.ClientRead,
    ],
  },
];

// ─── Lookup Helpers ──────────────────────────────────────────────────────────

const matrixByName = new Map(
  ROLE_PERMISSION_MATRIX.map((r) => [r.name, r]),
);

export function getPermissionsForRole(roleName: string): Permission[] {
  return matrixByName.get(roleName as RoleName)?.permissions ?? [];
}

export function getRoleDefinition(roleName: string): RoleDefinition | undefined {
  return matrixByName.get(roleName as RoleName);
}

export function isRoleInPlane(roleName: string, plane: ControlPlane): boolean {
  return matrixByName.get(roleName as RoleName)?.plane === plane;
}

export function roleHasPermission(roleName: string, permission: Permission): boolean {
  return getPermissionsForRole(roleName).includes(permission);
}
