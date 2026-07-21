/**
 * Sub-tenant management for the Company Admin plane.
 *
 * A sub-tenant is a child Tenant row whose parentTenantId points at the
 * calling user's tenant. Sub-tenants are fully isolated data stores (assets,
 * users, etc.) but their assets count towards the parent tenant's licence.
 *
 * Company Admins create/manage sub-tenants for the divisions or client
 * accounts they run. Distinct from Client Companies (which are just contact
 * records on the parent tenant).
 */
import { Readable } from 'stream';

import { ConflictError, NotFoundError, ValidationError } from '../lib/errors';
import { logger } from '../lib/logger';
import { minioClient, PHOTO_BUCKET } from '../lib/minio';
import { prisma } from '../lib/prisma';

import { slugifyLoginId } from './platform-admin.service';

const LOGIN_ID_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;

export interface SubTenantCompanyInput {
  legalName: string;
  tradingName?: string;
  registrationNumber?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  stateProvince?: string;
  postalCode?: string;
  country?: string;
  primaryContactName?: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
  currency?: string;
}

export interface CreateSubTenantInput {
  loginId?: string;
  organisationName: string;
  company: SubTenantCompanyInput;
}

export async function listSubTenants(parentTenantId: string) {
  return prisma.tenant.findMany({
    where: { parentTenantId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      active: true,
      onboardingComplete: true,
      createdAt: true,
      updatedAt: true,
      company: {
        select: {
          legalName: true,
          tradingName: true,
          city: true,
          country: true,
          primaryContactName: true,
          primaryContactEmail: true,
          logoStorageKey: true,
          currency: true,
        },
      },
      _count: { select: { assets: true, users: true } },
    },
  });
}

export async function getSubTenant(parentTenantId: string, subTenantId: string) {
  const t = await prisma.tenant.findUnique({
    where: { id: subTenantId },
    include: { company: true, _count: { select: { assets: true, users: true } } },
  });
  if (!t || t.parentTenantId !== parentTenantId) {
    throw new NotFoundError('Sub-tenant not found');
  }
  return t;
}

export async function createSubTenant(
  parentTenantId: string,
  actorId: string,
  input: CreateSubTenantInput,
) {
  const orgName = input.organisationName?.trim();
  if (!orgName)                            throw new ValidationError('Organisation name is required');
  if (!input.company?.legalName?.trim())   throw new ValidationError('Legal name is required');

  const parent = await prisma.tenant.findUnique({ where: { id: parentTenantId } });
  if (!parent) throw new NotFoundError('Parent tenant not found');
  if (parent.parentTenantId) {
    throw new ValidationError('Cannot create sub-tenants under another sub-tenant');
  }

  const loginId = (input.loginId?.trim() || slugifyLoginId(orgName)).toLowerCase();
  if (!loginId) throw new ValidationError('Login ID could not be derived — please enter one');
  if (loginId.length < 3 || loginId.length > 32) {
    throw new ValidationError('Login ID must be 3–32 characters');
  }
  if (!LOGIN_ID_RE.test(loginId)) {
    throw new ValidationError('Login ID must be lowercase letters, numbers, and hyphens (starting and ending with a letter or number)');
  }
  const clash = await prisma.tenant.findUnique({ where: { id: loginId }, select: { id: true } });
  if (clash) throw new ConflictError('That Login ID is already in use — pick another');
  const nameClash = await prisma.tenant.findUnique({ where: { name: orgName }, select: { id: true } });
  if (nameClash) throw new ConflictError('An organisation with this name already exists');

  const subTenant = await prisma.tenant.create({
    data: {
      id: loginId,
      name: orgName,
      parentTenantId: parent.id,
      deploymentMode: parent.deploymentMode,
      // Sub-tenants inherit their parent's licence — they don't need their
      // own onboarding wizard, so mark them complete and active immediately.
      onboardingComplete: true,
      active: true,
      company: {
        create: {
          legalName:            input.company.legalName.trim(),
          tradingName:          input.company.tradingName?.trim() || null,
          registrationNumber:   input.company.registrationNumber?.trim() || null,
          addressLine1:         input.company.addressLine1?.trim() || '',
          addressLine2:         input.company.addressLine2?.trim() || null,
          city:                 input.company.city?.trim() || '',
          stateProvince:        input.company.stateProvince?.trim() || null,
          postalCode:           input.company.postalCode?.trim() || null,
          country:              input.company.country?.trim() || '',
          primaryContactName:   input.company.primaryContactName?.trim() || '',
          primaryContactEmail:  input.company.primaryContactEmail?.trim() || '',
          primaryContactPhone:  input.company.primaryContactPhone?.trim() || null,
          currency:             input.company.currency?.trim() || 'USD',
        },
      },
    },
    include: { company: true },
  });

  prisma.auditEvent.create({
    data: {
      tenantId: parent.id,
      actorId,
      entityType: 'tenant',
      entityId: subTenant.id,
      action: 'sub_tenant_created',
      metadata: { loginId, organisationName: orgName },
    },
  }).catch((e) => logger.error('audit_event_write_failed', { error: e?.message }));

  return subTenant;
}

export async function updateSubTenantCompany(
  parentTenantId: string,
  subTenantId: string,
  actorId: string,
  input: Partial<SubTenantCompanyInput>,
) {
  const sub = await getSubTenant(parentTenantId, subTenantId);

  const data: Record<string, unknown> = {};
  const fields: (keyof SubTenantCompanyInput)[] = [
    'legalName', 'tradingName', 'registrationNumber',
    'addressLine1', 'addressLine2', 'city', 'stateProvince', 'postalCode', 'country',
    'primaryContactName', 'primaryContactEmail', 'primaryContactPhone', 'currency',
  ];
  for (const f of fields) {
    const v = input[f];
    if (v !== undefined) data[f] = typeof v === 'string' ? v.trim() || null : v;
  }
  if (typeof data.legalName === 'string' && !data.legalName) {
    throw new ValidationError('Legal name cannot be empty');
  }

  const company = sub.company
    ? await prisma.company.update({ where: { tenantId: subTenantId }, data })
    : await prisma.company.create({
        data: {
          tenantId: subTenantId,
          legalName: (data.legalName as string) || sub.name,
          addressLine1: (data.addressLine1 as string) || '',
          city:         (data.city as string) || '',
          country:      (data.country as string) || '',
          primaryContactName:  (data.primaryContactName as string) || '',
          primaryContactEmail: (data.primaryContactEmail as string) || '',
          ...data,
        },
      });

  prisma.auditEvent.create({
    data: {
      tenantId: parentTenantId,
      actorId,
      entityType: 'tenant',
      entityId: subTenantId,
      action: 'sub_tenant_updated',
    },
  }).catch((e) => logger.error('audit_event_write_failed', { error: e?.message }));

  return company;
}

export async function uploadSubTenantLogo(
  parentTenantId: string,
  subTenantId: string,
  actorId: string,
  file: { buffer: Buffer; mimetype: string },
) {
  const sub = await getSubTenant(parentTenantId, subTenantId);
  if (!sub.company) {
    throw new ValidationError('Company details must be set before uploading a logo');
  }

  if (sub.company.logoStorageKey) {
    await minioClient.removeObject(PHOTO_BUCKET, sub.company.logoStorageKey).catch(() => {});
  }

  const ext = file.mimetype === 'image/png' ? '.png'
            : file.mimetype === 'image/webp' ? '.webp'
            : '.jpg';
  const storageKey = `${subTenantId}/logo/company-logo${ext}`;

  await minioClient.putObject(PHOTO_BUCKET, storageKey, file.buffer, file.buffer.length, {
    'Content-Type': file.mimetype,
  });
  await prisma.company.update({
    where: { tenantId: subTenantId },
    data: { logoStorageKey: storageKey },
  });

  prisma.auditEvent.create({
    data: {
      tenantId: parentTenantId,
      actorId,
      entityType: 'tenant',
      entityId: subTenantId,
      action: 'sub_tenant_logo_uploaded',
    },
  }).catch(() => {});

  return { logoStorageKey: storageKey };
}

export async function deleteSubTenantLogo(
  parentTenantId: string,
  subTenantId: string,
  actorId: string,
) {
  const sub = await getSubTenant(parentTenantId, subTenantId);
  if (!sub.company?.logoStorageKey) throw new NotFoundError('No logo uploaded');

  await minioClient.removeObject(PHOTO_BUCKET, sub.company.logoStorageKey).catch(() => {});
  await prisma.company.update({
    where: { tenantId: subTenantId },
    data: { logoStorageKey: null },
  });

  prisma.auditEvent.create({
    data: {
      tenantId: parentTenantId,
      actorId,
      entityType: 'tenant',
      entityId: subTenantId,
      action: 'sub_tenant_logo_removed',
    },
  }).catch(() => {});

  return { removed: true };
}

/**
 * Stream a sub-tenant's logo image. Used by the public logo endpoint so an
 * <img> tag can render it without an auth header.
 */
export async function streamSubTenantLogo(subTenantId: string): Promise<
  { stream: Readable; mime: string } | null
> {
  const company = await prisma.company.findUnique({ where: { tenantId: subTenantId } });
  if (!company?.logoStorageKey) return null;
  const stream = await minioClient.getObject(PHOTO_BUCKET, company.logoStorageKey) as Readable;
  const ext = company.logoStorageKey.split('.').pop();
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return { stream, mime };
}
