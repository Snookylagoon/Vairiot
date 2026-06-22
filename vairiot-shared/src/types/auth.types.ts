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
