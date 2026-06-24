import { create } from 'zustand';
import { api, TOKEN_KEY, REFRESH_KEY } from '@/lib/api';
import type { UserProfile } from 'vairiot-shared';
import { PLATFORM_ROLES } from 'vairiot-shared';

interface AuthState {
  user:    UserProfile | null;
  loading: boolean;
  login:   (email: string, password: string, tenantId: string) => Promise<void>;
  logout:  () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user:    null,
  loading: true,

  login: async (email, password, tenantId) => {
    const { data } = await api.post('/api/v1/auth/login', { email, password, tenantId });

    if (data.requiresTwoFactor) {
      throw Object.assign(new Error('2FA required'), { twoFactorChallengeToken: data.twoFactorChallengeToken });
    }

    localStorage.setItem(TOKEN_KEY,   data.accessToken);
    localStorage.setItem(REFRESH_KEY, data.refreshToken);

    const me = await api.get('/api/v1/auth/me');
    const isPlatform = me.data.roles?.some((r: string) => PLATFORM_ROLES.includes(r as never));
    if (!isPlatform) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
      throw new Error('Access denied. This portal is restricted to platform administrators.');
    }
    set({ user: me.data });
  },

  logout: async () => {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    try {
      await api.post('/api/v1/auth/logout', { refreshToken: refreshToken ?? undefined });
    } catch { /* best-effort */ }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    set({ user: null });
    window.location.href = '/login';
  },

  hydrate: async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { set({ loading: false }); return; }
    try {
      const { data } = await api.get('/api/v1/auth/me');
      const isPlatform = data.roles?.some((r: string) => PLATFORM_ROLES.includes(r as never));
      if (!isPlatform) {
        localStorage.removeItem(TOKEN_KEY);
        set({ user: null, loading: false });
        return;
      }
      set({ user: data, loading: false });
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      set({ user: null, loading: false });
    }
  },
}));
