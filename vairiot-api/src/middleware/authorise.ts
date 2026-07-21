import { NextFunction, Request, Response } from 'express';
import {
  PLATFORM_ROLES,
  CLIENT_ROLES,
  type RoleName,
} from 'vairiot-shared';

// ─── requireRole ─────────────────────────────────────────────────────────────
// Passes if the user holds ANY of the listed roles.
export function requireRole(...allowed: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) { res.status(401).json({ error: 'Authorisation required' }); return; }
    const match = req.user.roles.some((r) => allowed.includes(r));
    if (!match) {
      res.status(403).json({ error: 'Insufficient role', code: 'ROLE_REQUIRED' });
      return;
    }
    next();
  };
}

// ─── requirePermission ───────────────────────────────────────────────────────
// Passes if the user holds ALL of the listed permissions.
export function requirePermission(...required: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) { res.status(401).json({ error: 'Authorisation required' }); return; }
    const missing = required.filter((p) => !req.user!.permissions.includes(p));
    if (missing.length > 0) {
      res.status(403).json({ error: 'Insufficient permissions', code: 'PERMISSION_REQUIRED', missing });
      return;
    }
    next();
  };
}

// ─── requireAnyPermission (kept for backwards compatibility) ─────────────────
// Passes if the user holds AT LEAST ONE of the listed permissions.
export function requireAnyPermission(...perms: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) { res.status(401).json({ error: 'Authorisation required' }); return; }
    if (!perms.some((p) => req.user!.permissions.includes(p))) {
      res.status(403).json({ error: 'Insufficient permissions', code: 'PERMISSION_REQUIRED' });
      return;
    }
    next();
  };
}

// ─── requireTenantScope ──────────────────────────────────────────────────────
// Ensures a non-platform user can only access their own tenant's data.
// Platform roles (Platform Super Admin, Licensing Authority) may access any
// tenant when a ?tenantId query param is supplied.
export function requireTenantScope() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) { res.status(401).json({ error: 'Authorisation required' }); return; }

    const isPlatform = req.user.roles.some((r) =>
      PLATFORM_ROLES.includes(r as RoleName),
    );

    if (isPlatform) {
      // Platform users may optionally scope to a tenant via query param
      if (req.query.tenantId) {
        req.scopedTenantId = req.query.tenantId as string;
      }
      next();
      return;
    }

    // Tenant/client users are locked to their own tenant
    req.scopedTenantId = req.user.tenantId;
    next();
  };
}

// ─── requireClientScope ──────────────────────────────────────────────────────
// For client-plane roles, restricts data access to assets linked to their
// client company. Expects :clientCompanyId route param or clientCompanyId in
// the JWT metadata. Non-client roles pass through unchanged.
export function requireClientScope() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) { res.status(401).json({ error: 'Authorisation required' }); return; }

    const isClientRole = req.user.roles.some((r) =>
      CLIENT_ROLES.includes(r as RoleName),
    );
    if (!isClientRole) { next(); return; }

    const clientCompanyId = req.params.clientCompanyId ?? req.query.clientCompanyId;
    if (!clientCompanyId) {
      res.status(403).json({
        error: 'Client-scoped users must specify a client company',
        code: 'CLIENT_SCOPE_REQUIRED',
      });
      return;
    }
    req.scopedClientCompanyId = clientCompanyId as string;
    next();
  };
}

// Extend Express Request for scoping
declare global {
  namespace Express {
    interface Request {
      scopedTenantId?: string;
      scopedClientCompanyId?: string;
    }
  }
}
