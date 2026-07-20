/// <reference types="vite/client" />
import axios, { AxiosError, type AxiosRequestConfig } from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3001',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('vairiot_access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Coalesce concurrent refreshes so only one /auth/refresh fires at a time.
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('vairiot_refresh_token');
  if (!refreshToken) return null;
  try {
    const { data } = await axios.post(
      `${api.defaults.baseURL}/api/v1/auth/refresh`,
      { refreshToken },
      { headers: { 'Content-Type': 'application/json' } },
    );
    localStorage.setItem('vairiot_access_token',  data.accessToken);
    localStorage.setItem('vairiot_refresh_token', data.refreshToken);
    return data.accessToken as string;
  } catch {
    return null;
  }
}

// Pages that work without a session — an expired token must not yank the user
// off them (e.g. opening an invite link with a stale session in localStorage).
const PUBLIC_PATHS = ['/login', '/register', '/accept-invite'];

function redirectToLogin(): void {
  localStorage.removeItem('vairiot_access_token');
  localStorage.removeItem('vairiot_refresh_token');
  if (!PUBLIC_PATHS.includes(window.location.pathname)) window.location.href = '/login';
}

// On 401, try refresh once then replay the original request.
api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const original = err.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
    const url = original?.url ?? '';

    // Don't refresh on the auth endpoints themselves.
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
