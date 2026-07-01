export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface UserProfile {
  userId: string;
  email: string;
  tenantId: string;
  tenantName: string;
  /** Set only when the caller has switched into a sub-tenant view. */
  originalTenantId?: string | null;
  /** Display name of the parent tenant, when impersonating. */
  originalTenantName?: string | null;
  currency?: string;
  roles: string[];
  permissions: string[];
  featureFlags?: Record<string, boolean>;
}

export interface LoginRequest {
  email: string;
  password: string;
  tenantId: string;
}
