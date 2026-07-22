import { ApiError, api, credentialedFetch } from "./api";
import type { ResourceStatus, ResourceType } from "./resource-types";
import type { MoneyWire } from "./money";

export type BookingMode = "TIME" | "GAME" | "PERSON" | "MIXED";

export type ResourceRate = {
  id: string;
  label: string;
  durationMinutes: number | null;
  price: MoneyWire;
  sortOrder: number;
};

export type ResourceUnit = {
  id: string;
  name: string;
  type: ResourceType;
  description: string | null;
  imageUrl: string | null;
  hourlyRate: MoneyWire;
  status: ResourceStatus;
  sortOrder: number;
  categoryId: string | null;
};

export type ResourceCategory = {
  id: string;
  type: ResourceType;
  bookingMode: BookingMode;
  name: string;
  description: string | null;
  imageUrl: string | null;
  imageUrl2: string | null;
  sortOrder: number;
  slotMinutes: number;
  playstationGames: string[];
  offeringConfig: Record<string, unknown> | null;
  rates: ResourceRate[];
  resources: ResourceUnit[];
};

export type ResourceCatalog = {
  categories: ResourceCategory[];
  uncategorized: ResourceUnit[];
};

export function fetchResourceCatalog() {
  return api<ResourceCatalog>("/resources/catalog");
}

export function createResourceCategory(body: {
  type: ResourceType;
  name: string;
  description?: string;
  slotMinutes?: number;
  bookingMode?: BookingMode;
  playstationGames?: string[];
  offeringConfig?: Record<string, unknown>;
  unitCount?: number;
  unitNamePrefix?: string;
  rates?: { label: string; durationMinutes?: number; price: number }[];
}) {
  return api<ResourceCategory>("/resources/categories", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateResourceCategory(
  id: string,
  body: Partial<{
    type: ResourceType;
    name: string;
    description: string | null;
    slotMinutes: number;
    bookingMode: BookingMode;
    playstationGames: string[];
    offeringConfig: Record<string, unknown> | null;
    totalUnits: number;
    rates: { label: string; durationMinutes?: number; price: number }[];
  }>,
) {
  return api<ResourceCategory>(`/resources/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteResourceCategory(id: string) {
  return api(`/resources/categories/${id}`, { method: "DELETE" });
}

export function addResourceUnits(
  categoryId: string,
  body: { count: number; namePrefix?: string },
) {
  return api<ResourceCategory>(`/resources/categories/${categoryId}/units`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateResourceUnit(
  id: string,
  body: Partial<{
    name: string;
    description: string | null;
    status: ResourceStatus;
    hourlyRate: number;
  }>,
) {
  return api<ResourceUnit>(`/resources/units/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteResourceUnit(id: string) {
  return api(`/resources/units/${id}`, { method: "DELETE" });
}

export async function uploadResourceCategoryImage(
  categoryId: string,
  slot: "1" | "2",
  file: File,
): Promise<ResourceCategory> {
  const form = new FormData();
  form.append("file", file);
  const res = await credentialedFetch(
    `/resources/categories/${categoryId}/images/${slot}`,
    {
      method: "POST",
      body: form,
    },
  );
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    const raw = (body as { message?: string | string[] })?.message;
    const fromBody = Array.isArray(raw)
      ? raw.join(", ")
      : typeof raw === "string"
        ? raw
        : null;
    const message =
      fromBody ||
      (res.status === 413
        ? "Image is too large. Maximum upload is 8 MB."
        : `Upload failed (${res.status}).`);
    throw new ApiError(message, res.status, body);
  }
  return res.json() as Promise<ResourceCategory>;
}
