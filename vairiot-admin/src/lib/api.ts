/// <reference types="vite/client" />
import axios, { AxiosError, type AxiosRequestConfig } from 'axios';

const TOKEN_KEY   = 'vairiot_admin_access_token';
const REFRESH_KEY = 'vairiot_admin_refresh_token';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3001',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return null;
  try {
    const { data } = await axios.post(
      `${api.defaults.baseURL}/api/v1/auth/refresh`,
      { refreshToken },
      { headers: { 'Content-Type': 'application/json' } },
    );
    localStorage.setItem(TOKEN_KEY,   data.accessToken);
    localStorage.setItem(REFRESH_KEY, data.refreshToken);
    return data.accessToken as string;
  } catch {
    return null;
  }
}

function redirectToLogin(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  if (window.location.pathname !== '/login') window.location.href = '/login';
}

api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const original = err.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
    const url = original?.url ?? '';
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/refresh');

    if (err.response?.status === 401 && original && !original._retried && !isAuthEndpoint) {
      original._retried = true;
      refreshInFlight ??= refreshAccessToken().finally(() => { refreshInFlight = null; });
      const newToken = await refreshInFlight;
      if (newToken) {
        original.headers = { ...(original.headers ?? {}), Authorization: `Bearer ${newToken}` };
        return api.request(original);
      }
      redirectToLogin();
    } else if (err.response?.status === 401) {
      redirectToLogin();
    }
    return Promise.reject(err);
  },
);

export { TOKEN_KEY, REFRESH_KEY };
