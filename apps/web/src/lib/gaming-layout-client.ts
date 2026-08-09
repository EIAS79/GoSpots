import { ApiError, api, credentialedFetch } from "./api";
import type { ResourceType } from "./resource-types";
import type { MoneyWire } from "./money";
import type { SeatingZone } from "./seating-zone";

export type GamingSectionUnit = {
  id: string;
  name: string;
  status: string;
  sortOrder: number;
  capacity?: number | null;
};

export type DiningTableGroupDetail = {
  id: string;
  sectionId: string;
  name: string | null;
  capacity: number;
  description: string | null;
  imageUrl: string | null;
  seatsPerRow: number;
  sortOrder: number;
  tableCount: number;
  units: GamingSectionUnit[];
};

export type GamingSectionDetail = {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryType: ResourceType;
  name: string;
  floor: number;
  isVip: boolean;
  hourlyPriceAddon: MoneyWire;
  seatsPerRow: number;
  sortOrder: number;
  seatCount: number;
  zone?: SeatingZone | string | null;
  description?: string | null;
  imageUrl?: string | null;
  defaultTableCapacity?: number | null;
  tableGroups?: DiningTableGroupDetail[];
  units: GamingSectionUnit[];
};

export type GamingSectionSummary = {
  id: string;
  name: string;
  floor: number;
  isVip: boolean;
  hourlyPriceAddon: MoneyWire;
  seatsPerRow: number;
  sortOrder: number;
  seatCount: number;
};

export function fetchGamingSections(categoryId?: string) {
  const q = categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : "";
  return api<{ sections: GamingSectionDetail[] }>(`/resources/gaming-sections${q}`);
}

export function createGamingSection(body: {
  categoryId: string;
  name: string;
  floor?: number;
  isVip?: boolean;
  hourlyPriceAddon?: number;
  seatsPerRow?: number;
  seatCount?: number;
  defaultTableCapacity?: number;
  zone?: SeatingZone | string;
  description?: string;
}) {
  return api<{ sections: GamingSectionDetail[] }>("/resources/gaming-sections", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateGamingSection(
  id: string,
  body: {
    name?: string;
    floor?: number;
    isVip?: boolean;
  hourlyPriceAddon?: number;
    seatsPerRow?: number;
    seatCount?: number;
    sortOrder?: number;
    defaultTableCapacity?: number;
    zone?: SeatingZone | string;
    description?: string;
  },
) {
  return api<{ sections: GamingSectionDetail[] }>(
    `/resources/gaming-sections/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
}

export function deleteGamingSection(id: string) {
  return api<{ ok: boolean }>(`/resources/gaming-sections/${id}`, {
    method: "DELETE",
  });
}

export async function uploadGamingSectionImage(
  sectionId: string,
  file: File,
): Promise<{ sections: GamingSectionDetail[] }> {
  const form = new FormData();
  form.append("file", file);
  const res = await credentialedFetch(
    `/resources/gaming-sections/${sectionId}/image`,
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
  return res.json() as Promise<{ sections: GamingSectionDetail[] }>;
}

export function createDiningTableGroup(body: {
  sectionId: string;
  capacity: number;
  tableCount: number;
  name?: string;
  description?: string;
  seatsPerRow?: number;
}) {
  return api<{ sections: GamingSectionDetail[] }>("/resources/dining-table-groups", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateDiningTableGroup(
  id: string,
  body: {
    capacity?: number;
    tableCount?: number;
    name?: string;
    description?: string | null;
    seatsPerRow?: number;
    sortOrder?: number;
  },
) {
  return api<{ sections: GamingSectionDetail[] }>(
    `/resources/dining-table-groups/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
}

export function deleteDiningTableGroup(id: string) {
  return api<{ sections: GamingSectionDetail[] }>(
    `/resources/dining-table-groups/${id}`,
    { method: "DELETE" },
  );
}

export async function uploadDiningTableGroupImage(
  groupId: string,
  file: File,
): Promise<{ sections: GamingSectionDetail[] }> {
  const form = new FormData();
  form.append("file", file);
  const res = await credentialedFetch(
    `/resources/dining-table-groups/${groupId}/image`,
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
    throw new ApiError(
      fromBody || `Upload failed (${res.status}).`,
      res.status,
      body,
    );
  }
  return res.json() as Promise<{ sections: GamingSectionDetail[] }>;
}
