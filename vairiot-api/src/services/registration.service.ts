import { ROLE_PERMISSION_MATRIX } from 'vairiot-shared';

import { ConflictError, ValidationError } from '../lib/errors';
import { signAccessToken, signRefreshToken } from '../lib/jwt';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';

import { hashPassword } from './auth.service';
import { activateLicence } from './licence.service';
import { validatePasswordPolicy } from './password-policy.service';



export interface RegistrationInput {
  organisationName: string;
  name: string;
  email: string;
  password: string;
}

export interface RegistrationResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  tenantId: string;
}

export async function registerNewTenant(input: RegistrationInput): Promise<RegistrationResult> {
  if (!input.organisationName?.trim()) throw new ValidationError('Organisation name is required');
  if (!input.name?.trim()) throw new ValidationError('Your name is required');
  if (!input.email?.trim()) throw new ValidationError('Email is required');
  if (!input.password) throw new ValidationError('Password is required');

  validatePasswordPolicy(input.password);

  const tenantName = input.organisationName.trim();
  const existing = await prisma.tenant.findUnique({ where: { name: tenantName } });
  if (existing) throw new ConflictError('An organisation with this name already exists');

  const passwordHash = await hashPassword(input.password);

  // Create tenant, Company Admin role, and user in a transaction
  const { user, tenant } = await prisma.$transaction(async (tx) => {
    const t = await tx.tenant.create({
      data: {
        name: tenantName,
        onboardingComplete: false,
      },
    });

    // Create all system roles for the tenant
    const roleDefs = ROLE_PERMISSION_MATRIX.filter((r) => r.isSystem);
    for (const def of roleDefs) {
      await tx.role.create({
        data: {
          tenantId: t.id,
          name: def.name,
          permissions: [...def.permissions],
          isSystem: true,
        },
      });
    }

    const adminRole = await tx.role.findFirst({
      where: { tenantId: t.id, name: 'Company Admin' },
    });
    if (!adminRole) throw new Error('Company Admin role not found after creation');

    const u = await tx.user.create({
      data: {
        tenantId: t.id,
        email: input.email.toLowerCase().trim(),
        name: input.name.trim(),
        passwordHash,
        active: true,
      },
    });

    await tx.userRole.create({
      data: { userId: u.id, roleId: adminRole.id },
    });

    return { user: u, tenant: t };
  });

  // Ensure licence tiers exist
  await prisma.licenceTier.upsert({
    where: { name: 'FREE' },
    update: {},
    create: { name: 'FREE', displayName: 'Free', maxAssets: 500, pricePerYear: 0 },
  }).catch(() => {});
  await prisma.licenceTier.upsert({
    where: { name: 'TIER_2' },
    update: {},
    create: { name: 'TIER_2', displayName: 'Professional', maxAssets: 1500, pricePerYear: 50 },
  }).catch(() => {});
  await prisma.licenceTier.upsert({
    where: { name: 'TIER_3' },
    update: {},
    create: { name: 'TIER_3', displayName: 'Enterprise', maxAssets: -1, pricePerYear: 100 },
  }).catch(() => {});

  // Auto-activate FREE licence and mark the onboarding step complete
  await activateLicence(tenant.id, 'FREE', user.id);
  await prisma.onboardingProgress.upsert({
    where: { tenantId_step: { tenantId: tenant.id, step: 'licence_activation' } },
    update: { completed: true, completedAt: new Date(), completedBy: user.id, data: { tierName: 'FREE' } as never },
    create: {
      tenantId: tenant.id,
      step: 'licence_activation' as never,
      completed: true,
      completedAt: new Date(),
      completedBy: user.id,
      data: { tierName: 'FREE' } as never,
    },
  });

  const roles = ['Company Admin'];
  const permissions = ROLE_PERMISSION_MATRIX
    .filter((r) => r.name === 'Company Admin')
    .flatMap((r) => r.permissions);

  const accessToken = signAccessToken({
    sub: user.id,
    tenantId: tenant.id,
    email: user.email,
    roles,
    permissions,
  });
  const refreshToken = signRefreshToken({
    sub: user.id,
    tenantId: tenant.id,
    type: 'refresh',
  });

  logger.info('New tenant registered', { tenantId: tenant.id, name: tenant.name, email: user.email });

  prisma.auditEvent.create({
    data: {
      tenantId: tenant.id,
      actorId: user.id,
      entityType: 'tenant',
      entityId: tenant.id,
      action: 'tenant_registered',
      metadata: { organisationName: input.organisationName, email: input.email },
    },
  }).catch((e) => logger.error('Audit event write failed', { error: e.message }));

  return {
    accessToken,
    refreshToken,
    expiresIn: process.env.JWT_EXPIRY ?? '8h',
    tenantId: tenant.id,
  };
}
