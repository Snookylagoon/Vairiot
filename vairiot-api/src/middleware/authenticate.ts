import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken, type TokenPayload } from '../lib/jwt';
declare global { namespace Express { interface Request { user?: TokenPayload; } } }
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) { res.status(401).json({ error: 'Authorisation required' }); return; }
  try { req.user = verifyAccessToken(h.slice(7)); next(); }
  catch { res.status(401).json({ error: 'Invalid or expired token' }); }
}
export function requirePermission(...perms: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) { res.status(401).json({ error: 'Authorisation required' }); return; }
    if (!perms.some((p) => req.user!.roles.includes(p))) { res.status(403).json({ error: 'Insufficient permissions' }); return; }
    next();
  };
}
