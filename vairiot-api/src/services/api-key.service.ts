import { randomBytes, createHash } from 'crypto';

import { NotFoundError } from '../lib/errors';
import { prisma } from '../lib/prisma';

import { recordAuditEvent } from './audit-event.service';

const PREFIX = 'vai_';

export async function listApiKeys(tenantId: string) {
  return prisma.apiKey.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, prefix: true, scopes: true,
      createdBy: true, createdAt: true, lastUsedAt: true, revokedAt: true,
    },
  });
}

export async function createApiKey(
  tenantId: string,
  createdBy: string,
  data: { name: string; scopes?: string[] },
) {
  const raw = randomBytes(24).toString('hex');
  const token = `${PREFIX}${raw}`;
  const prefix = token.slice(0, 12);
  const hash = createHash('sha256').update(token).digest('hex');
  const key = await prisma.apiKey.create({
    data: {
      tenantId,
      name: data.name,
      prefix,
      hash,
      scopes: data.scopes ?? [],
      createdBy,
    },
    select: { id: true, name: true, prefix: true, scopes: true, createdAt: true },
  });
  recordAuditEvent({
    tenantId, actor: createdBy,
    entityType: 'api-key', entityId: key.id, action: 'create',
    after: { name: key.name, prefix: key.prefix, scopes: key.scopes },
  });
  return { ...key, token };
}

export async function revokeApiKey(tenantId: string, actor: string, keyId: string) {
  const key = await prisma.apiKey.findFirst({ where: { id: keyId, tenantId } });
  if (!key) throw new NotFoundError('API key not found');
  if (key.revokedAt) return { id: key.id, revokedAt: key.revokedAt };
  const updated = await prisma.apiKey.update({
    where: { id: keyId },
    data: { revokedAt: new Date() },
    select: { id: true, revokedAt: true },
  });
  recordAuditEvent({
    tenantId, actor,
    entityType: 'api-key', entityId: keyId, action: 'revoke',
    after: { revokedAt: updated.revokedAt },
    metadata: { name: key.name, prefix: key.prefix },
  });
  return updated;
}
