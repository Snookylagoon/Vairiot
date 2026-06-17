import { create } from 'zustand';
import { api } from '@/lib/api';

interface UserProfile {
  userId:   string;
  email:    string;
  tenantId: string;
  roles:    string[];
}

interface AuthState {
  user:    UserProfile | null;
  loading: boolean;
  login:   (email: string, password: string, tenantId: string) => Promise<void>;
  logout:  () => void;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user:    null,
  loading: true,

  login: async (email, password, tenantId) => {
    const { data } = await api.post('/api/v1/auth/login', { email, password, tenantId });
    localStorage.setItem('vairiot_access_token',  data.accessToken);
    localStorage.setItem('vairiot_refresh_token', data.refreshToken);
    const me = await api.get('/api/v1/auth/me');
    set({ user: me.data });
  },

  logout: () => {
    localStorage.removeItem('vairiot_access_token');
    localStorage.removeItem('vairiot_refresh_token');
    set({ user: null });
    window.location.href = '/login';
  },

  hydrate: async () => {
    const token = localStorage.getItem('vairiot_access_token');
    if (!token) { set({ loading: false }); return; }
    try {
      const { data } = await api.get('/api/v1/auth/me');
      set({ user: data, loading: false });
    } catch {
      localStorage.removeItem('vairiot_access_token');
      set({ user: null, loading: false });
    }
  },
}));
