import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { AppError, ValidationError } from '../lib/errors';
import { activateLicence } from './licence.service';
import { hashPassword } from './auth.service';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OnboardingStatus {
  complete: boolean;
  steps: {
    user_registration: boolean;
    company_registration: boolean;
    client_registration: boolean;
    licence_activation: boolean;
  };
  nextStep: string | null;
}

const REQUIRED_STEPS = [
  'user_registration',
  'company_registration',
  'licence_activation',
] as const;

// ─── Get progress ────────────────────────────────────────────────────────────

export async function getOnboardingProgress(tenantId: string): Promise<OnboardingStatus> {
  const rows = await prisma.onboardingProgress.findMany({
    where: { tenantId },
  });

  const completedMap = new Map(rows.map((r) => [r.step, r.completed]));

  const steps = {
    user_registration: completedMap.get('user_registration') ?? false,
    company_registration: completedMap.get('company_registration') ?? false,
    client_registration: completedMap.get('client_registration') ?? false,
    licence_activation: completedMap.get('licence_activation') ?? false,
  };

  const nextStep = REQUIRED_STEPS.find((s) => !steps[s]) ?? null;
  const complete = REQUIRED_STEPS.every((s) => steps[s]);

  return { complete, steps, nextStep };
}

// ─── Step 1: User registration (already done via auth signup, mark complete) ─

export async function completeUserRegistration(
  tenantId: string,
  userId: string,
  data: { name: string; email: string; phone?: string },
): Promise<OnboardingStatus> {
  // Update user profile if needed
  await prisma.user.update({
    where: { id: userId },
    data: { name: data.name, phone: data.phone },
  });

  await upsertStep(tenantId, 'user_registration', userId, data);

  await auditOnboarding(tenantId, userId, 'user_registration_completed');

  return getOnboardingProgress(tenantId);
}

// ─── Step 2: Company registration ────────────────────────────────────────────

export interface CompanyRegistrationInput {
  legalName: string;
  tradingName?: string;
  registrationNumber?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  stateProvince?: string;
  postalCode?: string;
  country: string;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone?: string;
}

export async function registerCompany(
  tenantId: string,
  actorId: string,
  input: CompanyRegistrationInput,
): Promise<OnboardingStatus> {
  if (!input.legalName?.trim()) throw new ValidationError('Company name is required');
  if (!input.addressLine1?.trim()) throw new ValidationError('Address is required');
  if (!input.city?.trim()) throw new ValidationError('City is required');
  if (!input.country?.trim()) throw new ValidationError('Country is required');

  await prisma.company.upsert({
    where: { tenantId },
    update: { ...input },
    create: { tenantId, ...input },
  });

  // Update tenant name to match legal name
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { name: input.legalName },
  });

  await upsertStep(tenantId, 'company_registration', actorId, input);

  await auditOnboarding(tenantId, actorId, 'company_registration_completed', {
    legalName: input.legalName,
    country: input.country,
  });

  return getOnboardingProgress(tenantId);
}

// ─── Step 3: Client registration (optional) ──────────────────────────────────

export interface ClientRegistrationInput {
  legalName: string;
  tradingName?: string;
  registrationNumber?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  stateProvince?: string;
  postalCode?: string;
  country: string;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone?: string;
  authority: {
    name: string;
    email: string;
    phone?: string;
    jobTitle?: string;
  };
}

export async function registerClient(
  tenantId: string,
  actorId: string,
  input: ClientRegistrationInput,
): Promise<OnboardingStatus> {
  if (!input.legalName?.trim()) throw new ValidationError('Client company name is required');
  if (!input.authority?.name?.trim()) throw new ValidationError('Signatory name is required');
  if (!input.authority?.email?.trim()) throw new ValidationError('Signatory email is required');

  const { authority, ...companyData } = input;

  const clientCompany = await prisma.clientCompany.upsert({
    where: { tenantId_legalName: { tenantId, legalName: input.legalName } },
    update: { ...companyData },
    create: { tenantId, ...companyData },
  });

  // Upsert the client authority (signatory)
  const existingAuth = await prisma.clientAuthority.findFirst({
    where: { clientCompanyId: clientCompany.id, email: authority.email },
  });

  if (existingAuth) {
    await prisma.clientAuthority.update({
      where: { id: existingAuth.id },
      data: { name: authority.name, phone: authority.phone, jobTitle: authority.jobTitle, isSignatory: true },
    });
  } else {
    await prisma.clientAuthority.create({
      data: {
        clientCompanyId: clientCompany.id,
        name: authority.name,
        email: authority.email,
        phone: authority.phone,
        jobTitle: authority.jobTitle,
        isSignatory: true,
      },
    });
  }

  await upsertStep(tenantId, 'client_registration', actorId, {
    clientCompanyId: clientCompany.id,
    legalName: input.legalName,
  });

  await auditOnboarding(tenantId, actorId, 'client_registration_completed', {
    clientLegalName: input.legalName,
    authorityName: authority.name,
  });

  return getOnboardingProgress(tenantId);
}

// ─── Step 4: Licence activation ──────────────────────────────────────────────

export async function activateOnboardingLicence(
  tenantId: string,
  actorId: string,
  tierName: string,
): Promise<OnboardingStatus> {
  // Delegate to the licensing engine
  await activateLicence(tenantId, tierName, actorId);

  await upsertStep(tenantId, 'licence_activation', actorId, { tierName });

  await auditOnboarding(tenantId, actorId, 'licence_activation_completed', { tierName });

  return getOnboardingProgress(tenantId);
}

// ─── Complete onboarding ─────────────────────────────────────────────────────

export async function completeOnboarding(
  tenantId: string,
  actorId: string,
): Promise<OnboardingStatus> {
  const status = await getOnboardingProgress(tenantId);

  if (!status.steps.user_registration) {
    throw new AppError(400, 'User registration step is not complete', 'STEP_INCOMPLETE');
  }
  if (!status.steps.company_registration) {
    throw new AppError(400, 'Company registration step is not complete', 'STEP_INCOMPLETE');
  }
  if (!status.steps.licence_activation) {
    throw new AppError(400, 'Licence activation step is not complete', 'STEP_INCOMPLETE');
  }

  // Finalising also activates the tenant. Admin-created tenants start inactive
  // (adminCreateTenant sets active: false) so nobody signs into a workspace
  // that hasn't finished its own setup yet.
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { onboardingComplete: true, active: true },
  });

  await auditOnboarding(tenantId, actorId, 'onboarding_completed');

  return { ...status, complete: true };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function upsertStep(
  tenantId: string,
  step: string,
  actorId: string,
  data: unknown,
): Promise<void> {
  await prisma.onboardingProgress.upsert({
    where: { tenantId_step: { tenantId, step: step as never } },
    update: { completed: true, completedAt: new Date(), completedBy: actorId, data: data as never },
    create: {
      tenantId,
      step: step as never,
      completed: true,
      completedAt: new Date(),
      completedBy: actorId,
      data: data as never,
    },
  });
}

async function auditOnboarding(
  tenantId: string,
  actorId: string,
  action: string,
  metadata?: unknown,
): Promise<void> {
  prisma.auditEvent.create({
    data: {
      tenantId,
      actorId,
      entityType: 'onboarding',
      entityId: tenantId,
      action,
      metadata: metadata as never,
    },
  }).catch((e) => logger.error('Audit event write failed', { error: e.message }));
}
