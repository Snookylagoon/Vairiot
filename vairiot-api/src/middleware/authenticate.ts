import { createHash } from 'crypto';

import { NextFunction, Request, Response } from 'express';

import { verifyAccessToken, type TokenPayload } from '../lib/jwt';
import { prisma } from '../lib/prisma';
import { isTokenBlacklisted } from '../lib/redis';

declare global { namespace Express { interface Request { user?: TokenPayload; } } }

const API_KEY_PREFIX = 'vai_';
const API_KEY_PREFIX_LEN = 12;

async function verifyApiKey(token: string): Promise<TokenPayload | null> {
  const prefix = token.slice(0, API_KEY_PREFIX_LEN);
  const hash = createHash('sha256').update(token).digest('hex');
  const key = await prisma.apiKey.findFirst({
    where: { prefix, hash, revokedAt: null },
    select: { id: true, tenantId: true, scopes: true },
  });
  if (!key) return null;
  // Fire-and-forget: don't block the request on the lastUsedAt write.
  prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => { /* ignore */ });
  return {
    sub:         `apikey:${key.id}`,
    tenantId:    key.tenantId,
    email:       `apikey-${key.id}@vairiot.local`,
    roles:       [],
    permissions: key.scopes,
  };
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) { res.status(401).json({ error: 'Authorisation required' }); return; }
  const token = h.slice(7);
  if (token.startsWith(API_KEY_PREFIX)) {
    try {
      const payload = await verifyApiKey(token);
      if (!payload) { res.status(401).json({ error: 'Invalid or revoked API key' }); return; }
      req.user = payload;
      next();
    } catch { res.status(401).json({ error: 'Invalid API key' }); }
    return;
  }
  try {
    const payload = verifyAccessToken(token);
    if (payload.jti && await isTokenBlacklisted(payload.jti)) {
      res.status(401).json({ error: 'Token has been revoked' }); return;
    }
    req.user = payload;
    next();
  } catch { res.status(401).json({ error: 'Invalid or expired token' }); }
}

// Re-export from authorise.ts for backwards compatibility
export { requireAnyPermission } from './authorise';
