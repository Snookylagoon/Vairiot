/**
 * Tenant context switching for parent-tenant admins.
 *
 * A Company Admin on the parent tenant can select any of their sub-tenants
 * from the Dashboard and drop into an isolated view of that sub-tenant's
 * data. Server-side we mint a new access token with the target tenant's id
 * so every existing route filters correctly by tenantId. The original
 * tenantId is preserved in an `originalTenantId` claim so we can render
 * the "Return to parent" banner and validate the switch back.
 *
 * Sub-tenant users cannot switch context — they only ever see their own
 * tenant. This is enforced by refusing to mint a token when the caller's
 * currently-effective tenantId is a child (has a parentTenantId).
 */
import { Router, Request, Response } from 'express';

import { AppError, ValidationError } from '../../lib/errors';
import { signAccessToken } from '../../lib/jwt';
import { prisma } from '../../lib/prisma';
import { requireAnyPermission } from '../../middleware/authorise';
import { asyncHandler } from '../../middleware/error-handler';

export const tenantContextRouter = Router();

interface SwitchableTenantRow {
  id: string;
  name: string;
  legalName: string | null;
  isParent: boolean;
  isCurrent: boolean;
}

/**
 * Resolve the caller's "home" tenant — the tenant they originally logged
 * into. If they're currently impersonating a sub-tenant, this is the
 * originalTenantId; otherwise it's their current tenantId.
 */
function resolveHomeTenantId(req: Request): string {
  return req.user!.originalTenantId ?? req.user!.tenantId;
}

tenantContextRouter.get('/switchable-tenants',
  requireAnyPermission('company:manage'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const homeId = resolveHomeTenantId(req);

    const home = await prisma.tenant.findUnique({
      where: { id: homeId },
      select: {
        id: true, name: true, parentTenantId: true,
        company: { select: { legalName: true } },
      },
    });
    if (!home) {
      throw new AppError(404, 'Home tenant not found', 'TENANT_NOT_FOUND');
    }
    // Guard: users of sub-tenants can never switch context.
    if (home.parentTenantId) {
      res.json({ tenants: [] });
      return;
    }

    const children = await prisma.tenant.findMany({
      where: { parentTenantId: homeId },
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true,
        company: { select: { legalName: true } },
      },
    });

    const rows: SwitchableTenantRow[] = [
      {
        id: home.id,
        name: home.name,
        legalName: home.company?.legalName ?? null,
        isParent: true,
        isCurrent: req.user!.tenantId === home.id,
      },
      ...children.map(c => ({
        id: c.id,
        name: c.name,
        legalName: c.company?.legalName ?? null,
        isParent: false,
        isCurrent: req.user!.tenantId === c.id,
      })),
    ];

    res.json({ tenants: rows });
  }),
);

tenantContextRouter.post('/switch-context',
  requireAnyPermission('company:manage'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const targetTenantId = String(req.body?.tenantId ?? '').trim();
    if (!targetTenantId) throw new ValidationError('tenantId is required');

    const homeId = resolveHomeTenantId(req);

    // Confirm caller's home isn't already a sub-tenant. Belt-and-braces: a
    // sub-tenant user should never even get here (requireAnyPermission gates
    // it), but if they do, we refuse.
    const home = await prisma.tenant.findUnique({
      where: { id: homeId },
      select: { id: true, parentTenantId: true },
    });
    if (!home) throw new AppError(404, 'Home tenant not found', 'TENANT_NOT_FOUND');
    if (home.parentTenantId) {
      throw new AppError(403, 'Sub-tenant users cannot switch context', 'CONTEXT_SWITCH_FORBIDDEN');
    }

    // Determine which tenant we're moving to. Two legal targets:
    //   1. The home tenant itself (returning from a sub-tenant view).
    //   2. Any direct child of the home tenant.
    let target;
    if (targetTenantId === homeId) {
      target = { id: home.id, isReturn: true };
    } else {
      const child = await prisma.tenant.findUnique({
        where: { id: targetTenantId },
        select: { id: true, parentTenantId: true, active: true },
      });
      if (!child || child.parentTenantId !== homeId) {
        throw new AppError(404, 'Sub-tenant not found under this account', 'SUB_TENANT_NOT_FOUND');
      }
      if (!child.active) {
        throw new AppError(403, 'Sub-tenant is not active', 'SUB_TENANT_INACTIVE');
      }
      target = { id: child.id, isReturn: false };
    }

    // Mint a fresh access token. Permissions/roles are copied from the caller
    // untouched — data isolation still comes from the tenantId claim, which
    // every service filters by.
    const accessToken = signAccessToken({
      sub: req.user!.sub,
      tenantId: target.id,
      email: req.user!.email,
      roles: req.user!.roles,
      permissions: req.user!.permissions,
      originalTenantId: target.isReturn ? undefined : homeId,
    });

    // Load display name for the client-side UI hint.
    const t = await prisma.tenant.findUnique({
      where: { id: target.id },
      select: { name: true, company: { select: { legalName: true } } },
    });

    res.json({
      accessToken,
      tenantId: target.id,
      tenantName: t?.company?.legalName ?? t?.name ?? target.id,
      originalTenantId: target.isReturn ? null : homeId,
      expiresIn: process.env.JWT_EXPIRY ?? '8h',
    });
  }),
);
