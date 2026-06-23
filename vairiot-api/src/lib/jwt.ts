import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
if (!process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is required');
}
const SECRET  = process.env.JWT_SECRET;
const EXPIRY  = process.env.JWT_EXPIRY  ?? '8h';
const REFRESH = process.env.JWT_REFRESH_EXPIRY ?? '30d';
export interface TokenPayload { sub: string; tenantId: string; email: string; roles: string[]; permissions: string[]; jti?: string; exp?: number; }
export interface RefreshPayload { sub: string; tenantId: string; type: 'refresh'; jti?: string; exp?: number; }
export interface SetupTokenPayload { sub: string; tenantId: string; email: string; scope: '2fa_setup'; jti?: string; exp?: number; }
export const signAccessToken  = (p: Omit<TokenPayload, 'jti' | 'exp'>): string  => jwt.sign({ ...p, jti: randomUUID() }, SECRET, { expiresIn: EXPIRY } as jwt.SignOptions);
export const signRefreshToken = (p: Omit<RefreshPayload, 'jti' | 'exp'>): string => jwt.sign({ ...p, jti: randomUUID() }, SECRET, { expiresIn: REFRESH } as jwt.SignOptions);
export const signSetupToken   = (p: Omit<SetupTokenPayload, 'jti' | 'exp' | 'scope'>): string => jwt.sign({ ...p, scope: '2fa_setup', jti: randomUUID() }, SECRET, { expiresIn: '10m' } as jwt.SignOptions);
export const verifyAccessToken = (t: string): TokenPayload => jwt.verify(t, SECRET) as TokenPayload;
export function verifyRefreshToken(t: string): RefreshPayload {
  const p = jwt.verify(t, SECRET) as RefreshPayload;
  if (p.type !== 'refresh') throw new Error('Not a refresh token');
  return p;
}
export function verifySetupToken(t: string): SetupTokenPayload {
  const p = jwt.verify(t, SECRET) as SetupTokenPayload;
  if (p.scope !== '2fa_setup') throw new Error('Not a 2FA setup token');
  return p;
}
