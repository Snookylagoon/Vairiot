import { NextFunction, Response } from 'express';
import {
  PLATFORM_ROLES,
  CLIENT_ROLES,
  type RoleName,
} from 'vairiot-shared';

import type { Request } from '../types/http';

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
// tenant when a ?tenantId query param is supplied. A tenant or client user who
// names another tenant is refused outright rather than silently re-scoped, so
// a handler that ever reads ?tenantId can't be pointed at someone else's data.
// Mounted on the gated router in app.ts (KFR-040).
export function requireTenantScope() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) { res.status(401).json({ error: 'Authorisation required' }); return; }

    const isPlatform = req.user.roles.some((r) =>
      PLATFORM_ROLES.includes(r as RoleName),
    );
    const requested = typeof req.query.tenantId === 'string' ? req.query.tenantId : undefined;

    if (isPlatform) {
      if (requested) req.scopedTenantId = requested;
      next();
      return;
    }

    if (requested && requested !== req.user.tenantId) {
      res.status(403).json({ error: 'You can only access your own organisation', code: 'TENANT_SCOPE' });
      return;
    }
    req.scopedTenantId = req.user.tenantId;
    next();
  };
}

// ─── requireClientScope ──────────────────────────────────────────────────────
// Client-plane roles (Client Stakeholder, Client Authority) are read-only
// observers of the tenant that engaged them: any write is refused here, whatever
// a router's own permission check says. Users holding a tenant- or
// platform-plane role as well pass through unchanged.
//
// The previous version took the client company from a request parameter, which
// the caller controls, so it scoped nothing; it was also never mounted. Assets
// carry no client-company link yet, so narrowing reads to one client's assets
// needs a schema change first (KFR-040).
const CLIENT_READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function requireClientScope() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) { res.status(401).json({ error: 'Authorisation required' }); return; }

    const clientOnly = req.user.roles.length > 0 && req.user.roles.every((r) =>
      CLIENT_ROLES.includes(r as RoleName),
    );
    if (!clientOnly || CLIENT_READ_METHODS.has(req.method)) { next(); return; }

    res.status(403).json({
      error: 'Client accounts have read-only access',
      code: 'CLIENT_READ_ONLY',
    });
  };
}

// Extend Express Request for scoping
declare global {
  namespace Express {
    interface Request {
      scopedTenantId?: string;
    }
  }
}
