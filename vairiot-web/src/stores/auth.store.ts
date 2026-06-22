import { create } from 'zustand';
import { api } from '@/lib/api';
import type { UserProfile } from 'vairiot-shared';
import { useCurrencyStore } from './currency.store';

function syncCurrencyFromUser(user: { currency?: string } | null) {
  if (user?.currency) {
    useCurrencyStore.getState().setCurrency(user.currency);
  }
}

export function hasAnyPermission(user: UserProfile | null, ...required: string[]): boolean {
  if (!user) return false;
  return required.some((p) => user.permissions.includes(p));
}

interface AuthState {
  user:    UserProfile | null;
  loading: boolean;
  onboardingRequired: boolean;
  login:   (email: string, password: string, tenantId: string) => Promise<void>;
  logout:  () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user:    null,
  loading: true,
  onboardingRequired: false,

  login: async (email, password, tenantId) => {
    const { getDeviceCheckIn } = await import('@/lib/device');
    const { data } = await api.post('/api/v1/auth/login', { email, password, tenantId, device: getDeviceCheckIn() });
    localStorage.setItem('vairiot_access_token',  data.accessToken);
    localStorage.setItem('vairiot_refresh_token', data.refreshToken);
    const me = await api.get('/api/v1/auth/me');
    syncCurrencyFromUser(me.data);
    set({ user: me.data, onboardingRequired: false });
  },

  logout: async () => {
    const refreshToken = localStorage.getItem('vairiot_refresh_token');
    try {
      await api.post('/api/v1/auth/logout', { refreshToken: refreshToken ?? undefined });
    } catch { /* best-effort */ }
    localStorage.removeItem('vairiot_access_token');
    localStorage.removeItem('vairiot_refresh_token');
    set({ user: null, onboardingRequired: false });
    window.location.href = '/login';
  },

  hydrate: async () => {
    const token = localStorage.getItem('vairiot_access_token');
    if (!token) { set({ loading: false }); return; }
    try {
      const { data } = await api.get('/api/v1/auth/me');
      syncCurrencyFromUser(data);
      set({ user: data, loading: false, onboardingRequired: false });
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 403) {
        // 403 from onboarding guard — user is authenticated but onboarding incomplete
        try {
          const { data } = await api.get('/api/v1/auth/me');
          syncCurrencyFromUser(data);
          set({ user: data, loading: false, onboardingRequired: true });
          return;
        } catch { /* fall through */ }
      }
      localStorage.removeItem('vairiot_access_token');
      set({ user: null, loading: false });
    }
  },
}));
