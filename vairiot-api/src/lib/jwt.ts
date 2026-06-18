import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
const SECRET  = process.env.JWT_SECRET ?? 'dev-secret-CHANGE-IN-PRODUCTION';
const EXPIRY  = process.env.JWT_EXPIRY  ?? '8h';
const REFRESH = process.env.JWT_REFRESH_EXPIRY ?? '30d';
export interface TokenPayload { sub: string; tenantId: string; email: string; roles: string[]; permissions: string[]; jti?: string; exp?: number; }
export interface RefreshPayload { sub: string; tenantId: string; type: 'refresh'; jti?: string; exp?: number; }
export const signAccessToken  = (p: Omit<TokenPayload, 'jti' | 'exp'>): string  => jwt.sign({ ...p, jti: randomUUID() }, SECRET, { expiresIn: EXPIRY } as jwt.SignOptions);
export const signRefreshToken = (p: Omit<RefreshPayload, 'jti' | 'exp'>): string => jwt.sign({ ...p, jti: randomUUID() }, SECRET, { expiresIn: REFRESH } as jwt.SignOptions);
export const verifyAccessToken = (t: string): TokenPayload => jwt.verify(t, SECRET) as TokenPayload;
export function verifyRefreshToken(t: string): RefreshPayload {
  const p = jwt.verify(t, SECRET) as RefreshPayload;
  if (p.type !== 'refresh') throw new Error('Not a refresh token');
  return p;
}
