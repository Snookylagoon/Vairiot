import { createHash } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken, type TokenPayload } from '../lib/jwt';
import { prisma } from '../lib/prisma';

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
    sub:      `apikey:${key.id}`,
    tenantId: key.tenantId,
    email:    `apikey-${key.id}@vairiot.local`,
    roles:    key.scopes,
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
  try { req.user = verifyAccessToken(token); next(); }
  catch { res.status(401).json({ error: 'Invalid or expired token' }); }
}

export function requirePermission(...perms: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) { res.status(401).json({ error: 'Authorisation required' }); return; }
    if (!perms.some((p) => req.user!.roles.includes(p))) { res.status(403).json({ error: 'Insufficient permissions' }); return; }
    next();
  };
}
