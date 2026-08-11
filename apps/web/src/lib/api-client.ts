import { env } from './env';
import { getCsrfHeaders, setCachedCsrfToken } from './csrf';
import { getApiBaseUrl } from './api-base-url';
import { getVenuePathHeaders } from './venue-api-headers';

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
};

async function ensureCsrfToken(): Promise<void> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/auth/csrf`, {
      method: 'GET',
      credentials: 'include',
    });
    if (!res.ok) return;
    const body = (await res.json()) as { csrfToken?: string };
    if (body.csrfToken) setCachedCsrfToken(body.csrfToken);
  } catch {
    /* ignore */
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;

  const build = () =>
    fetch(`${env.apiUrl}${path}`, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...getVenuePathHeaders(),
        ...getCsrfHeaders(),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'include',
      cache: 'no-store',
    });

  let response = await build();
  const method = (options.method ?? 'GET').toUpperCase();
  if (response.status === 403 && method !== 'GET' && method !== 'HEAD') {
    await ensureCsrfToken();
    response = await build();
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Generic compatibility entry point used by data-heavy workspaces that need
 * to choose the HTTP verb dynamically. It deliberately shares the exact same
 * CSRF, venue-header, cookie and error-handling path as the typed `api` facade.
 */
export function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  return request<T>(path, options);
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};
