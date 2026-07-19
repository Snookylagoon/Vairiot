import { randomUUID } from 'crypto';

import jwt from 'jsonwebtoken';
if (!process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is required');
}
const BASE_SECRET    = process.env.JWT_SECRET;
// Use `||` (not `??`) so an empty string passed by the deployment env (e.g.
// `${JWT_ACCESS_SECRET:-}` in compose) falls back to the base secret instead of
// signing tokens with an empty key.
const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET  || BASE_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || BASE_SECRET;
const SETUP_SECRET   = process.env.JWT_SETUP_SECRET   || BASE_SECRET;

if (BASE_SECRET.length < 32) {
  // eslint-disable-next-line no-console
  console.warn('[security] JWT_SECRET is shorter than 32 characters — generate a longer random value (e.g. `openssl rand -hex 32`).');
}
if (process.env.NODE_ENV === 'production' &&
    (ACCESS_SECRET === REFRESH_SECRET || REFRESH_SECRET === SETUP_SECRET)) {
  // eslint-disable-next-line no-console
  console.warn('[security] JWT_ACCESS_SECRET / JWT_REFRESH_SECRET / JWT_SETUP_SECRET are not all distinct — set separate high-entropy secrets per token class.');
}
const EXPIRY  = process.env.JWT_EXPIRY  ?? '8h';
const REFRESH = process.env.JWT_REFRESH_EXPIRY ?? '30d';

export interface TokenPayload { sub: string; tenantId: string; email: string; roles: string[]; permissions: string[]; originalTenantId?: string; jti?: string; exp?: number; }
export interface RefreshPayload { sub: string; tenantId: string; type: 'refresh'; jti?: string; exp?: number; }
export interface SetupTokenPayload { sub: string; tenantId: string; email: string; scope: '2fa_setup'; jti?: string; exp?: number; }
export interface ChallengeTokenPayload { sub: string; tenantId: string; scope: 'password_change' | '2fa_challenge'; jti?: string; exp?: number; }

export const signAccessToken  = (p: Omit<TokenPayload, 'jti' | 'exp'>): string  => jwt.sign({ ...p, jti: randomUUID() }, ACCESS_SECRET, { expiresIn: EXPIRY } as jwt.SignOptions);
export const signRefreshToken = (p: Omit<RefreshPayload, 'jti' | 'exp'>): string => jwt.sign({ ...p, jti: randomUUID() }, REFRESH_SECRET, { expiresIn: REFRESH } as jwt.SignOptions);
export const signSetupToken   = (p: Omit<SetupTokenPayload, 'jti' | 'exp' | 'scope'>): string => jwt.sign({ ...p, scope: '2fa_setup', jti: randomUUID() }, SETUP_SECRET, { expiresIn: '10m' } as jwt.SignOptions);

export function signChallengeToken(p: Omit<ChallengeTokenPayload, 'jti' | 'exp'>): string {
  return jwt.sign({ ...p, jti: randomUUID() }, SETUP_SECRET, { expiresIn: '10m' } as jwt.SignOptions);
}

export const verifyAccessToken = (t: string): TokenPayload => jwt.verify(t, ACCESS_SECRET) as TokenPayload;

export function verifyRefreshToken(t: string): RefreshPayload {
  const p = jwt.verify(t, REFRESH_SECRET) as RefreshPayload;
  if (p.type !== 'refresh') throw new Error('Not a refresh token');
  return p;
}
export function verifySetupToken(t: string): SetupTokenPayload {
  const p = jwt.verify(t, SETUP_SECRET) as SetupTokenPayload;
  if (p.scope !== '2fa_setup') throw new Error('Not a 2FA setup token');
  return p;
}
export function verifyChallengeToken(t: string, expectedScope: ChallengeTokenPayload['scope']): ChallengeTokenPayload {
  const p = jwt.verify(t, SETUP_SECRET) as ChallengeTokenPayload;
  if (p.scope !== expectedScope) throw new Error(`Not a ${expectedScope} token`);
  return p;
}
