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

async function fetchResponse(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const { headers, ...rest } = options;

  const build = () =>
    fetch(`${env.apiUrl}${path}`, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...getVenuePathHeaders(),
        ...getCsrfHeaders(),
        ...headers,
      },
      credentials: 'include',
      cache: 'no-store',
    });

  let response = await build();
  const method = (options.method ?? 'GET').toUpperCase();
  if (response.status === 403 && method !== 'GET' && method !== 'HEAD') {
    await ensureCsrfToken();
    response = await build();
  }

  return response;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, ...rest } = options;
  const response = await fetchResponse(path, {
    ...rest,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Raw-response compatibility entry point used by data-heavy workspaces that
 * need to choose the HTTP verb dynamically and inspect status/error payloads.
 * It shares the same CSRF, venue-header and cookie path as the typed `api`
 * facade, while leaving response parsing to the caller.
 */
export function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  return fetchResponse(path, options);
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