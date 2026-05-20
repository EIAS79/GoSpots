import { getApiBaseUrl } from "./api-base-url";
import { getVenuePathHeaders } from "./venue-api-headers";

export const API_BASE_URL = getApiBaseUrl();

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...getVenuePathHeaders(),
        ...(init.headers ?? {}),
      },
      ...init,
    });
  } catch {
    throw new ApiError(
      `Cannot reach the API at ${API_BASE_URL}. The backend is probably not running (check terminal for PostgreSQL errors). From repo root run: pnpm db:setup then pnpm dev — then open http://localhost:4000/api/v1/health`,
      0,
    );
  }

  if (res.status === 204) return undefined as T;

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* ignore */
  }

  if (!res.ok) {
    const message =
      (body as { message?: string | string[] })?.message &&
      (Array.isArray((body as { message?: string[] }).message)
        ? (body as { message: string[] }).message.join(", ")
        : (body as { message: string }).message) ||
      `Request failed: ${res.status}`;
    throw new ApiError(message, res.status, body);
  }

  return body as T;
}
