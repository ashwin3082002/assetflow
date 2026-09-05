import axios, { AxiosError } from 'axios';
import type { ApiError } from '../types';

const TOKEN_KEY = 'assetflow.token';

export const API_BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage unavailable: session lives only in memory */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** Query params for list endpoints; values are strings because they live in the URL. */
export type ListParams = Record<string, string | undefined>;

/** Drops empty / undefined params so defaults apply server-side. */
export function compactParams(params: ListParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') out[k] = v;
  return out;
}

/** Resolves a stored image URL (e.g. /uploads/assets/x.png) against the API host. */
export function absoluteUrl(path: string): string {
  return path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
}

let onUnauthorized: (() => void) | null = null;

/** AuthContext registers a callback so a 401 anywhere clears the session (no hard redirects). */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

export function isApiError(err: unknown): err is ApiError {
  return typeof err === 'object' && err !== null && 'status' in err && 'code' in err && 'message' in err;
}

/** The only axios instance in the app. Every API module imports this. */
export const client = axios.create({ baseURL: `${API_BASE_URL}/api`, timeout: 15000 });

client.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error?: ApiError }>) => {
    const status = error.response?.status ?? 0;
    const body = error.response?.data?.error;
    const normalized: ApiError = {
      status,
      code: body?.code ?? (status === 0 ? 'NETWORK_ERROR' : 'UNKNOWN_ERROR'),
      message: body?.message ?? (status === 0 ? 'Cannot reach the server. Is the API running?' : 'Something went wrong'),
      details: body?.details,
    };
    const isLogin = error.config?.url?.includes('/auth/login');
    if (status === 401 && !isLogin) {
      clearToken();
      onUnauthorized?.();
    }
    return Promise.reject(normalized);
  },
);
