import { Permission } from './permissions.constants';

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

// ─── Roles that require mandatory TOTP 2FA ───────────────────────────────────
export const ROLES_REQUIRING_2FA: RoleName[] = [
  RoleName.PlatformSuperAdmin,
  RoleName.LicensingAuthority,
];

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
