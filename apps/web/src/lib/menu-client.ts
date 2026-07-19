import { ApiError, api } from "./api";
import { getApiBaseUrl } from "./api-base-url";
import { getVenuePathHeaders } from "./venue-api-headers";
import type { MealPeriod } from "./menu-periods";

export type TagType = "CATEGORY" | "FILTER" | "OFFER";

export type ShopTag = {
  id: string;
  name: string;
  slug: string;
  type: TagType;
  color: string | null;
  sortOrder: number;
};

export type MenuSection = {
  id: string;
  name: string;
  imageUrl: string | null;
  sortOrder: number;
  mealPeriod: MealPeriod | null;
  availableFrom: string | null;
  availableTo: string | null;
  availableDays: string;
};

export type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  imageUrl2: string | null;
  price: number;
  stock: number;
  stockDaily?: number;
  stockResetOn?: string | null;
  trackStock: boolean;
  isAvailable: boolean;
  useSectionTiming: boolean;
  availableFrom: string | null;
  availableTo: string | null;
  availableDays: string;
  sectionId: string | null;
  tagIds: string[];
  tags: ShopTag[];
};

export type FullMenu = {
  sections: MenuSection[];
  tags: ShopTag[];
  items: MenuItem[];
};

export function fetchMenu() {
  return api<FullMenu>("/menu");
}

export function createSection(body: {
  name: string;
  sortOrder?: number;
  mealPeriod?: MealPeriod;
  availableFrom?: string;
  availableTo?: string;
  availableDays?: string;
}) {
  return api<MenuSection>("/menu/sections", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateSection(
  id: string,
  body: Partial<{
    name: string;
    sortOrder: number;
    mealPeriod: MealPeriod | null;
    availableFrom: string | null;
    availableTo: string | null;
    availableDays: string;
    imageUrl: string | null;
  }>,
) {
  return api<MenuSection>(`/menu/sections/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteSection(id: string) {
  return api(`/menu/sections/${id}`, { method: "DELETE" });
}

export function createTag(body: {
  name: string;
  type: TagType;
  color?: string;
}) {
  return api<ShopTag>("/menu/tags", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function deleteTag(id: string) {
  return api(`/menu/tags/${id}`, { method: "DELETE" });
}

export type MenuItemInput = {
  name: string;
  sectionId?: string;
  description?: string;
  price: number;
  stock?: number;
  trackStock?: boolean;
  isAvailable?: boolean;
  useSectionTiming?: boolean;
  availableFrom?: string;
  availableTo?: string;
  availableDays?: string;
  tagIds?: string[];
};

export function createMenuItem(body: MenuItemInput) {
  return api<MenuItem>("/menu/items", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateMenuItem(id: string, body: Partial<MenuItemInput> & {
  imageUrl?: string | null;
  imageUrl2?: string | null;
  sectionId?: string | null;
  description?: string | null;
  availableFrom?: string | null;
  availableTo?: string | null;
}) {
  return api<MenuItem>(`/menu/items/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteMenuItem(id: string) {
  return api(`/menu/items/${id}`, { method: "DELETE" });
}

async function uploadMenuFile<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  const base = getApiBaseUrl();
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: "POST",
      credentials: "include",
      headers: getVenuePathHeaders(),
      body: form,
    });
  } catch {
    throw new ApiError(
      `Cannot reach the API at ${base}. Is the backend running? Try: pnpm dev`,
      0,
    );
  }
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    const message =
      (body as { message?: string | string[] })?.message &&
      (Array.isArray((body as { message?: string[] }).message)
        ? (body as { message: string[] }).message.join(", ")
        : (body as { message: string }).message) ||
      `Upload failed: ${res.status}`;
    throw new ApiError(message, res.status, body);
  }
  return res.json() as Promise<T>;
}

export async function uploadMenuItemImage(
  itemId: string,
  slot: "1" | "2",
  file: File,
): Promise<MenuItem> {
  return uploadMenuFile<MenuItem>(
    `/menu/items/${itemId}/images/${slot}`,
    file,
  );
}

export async function uploadSectionImage(
  sectionId: string,
  file: File,
): Promise<MenuSection> {
  return uploadMenuFile<MenuSection>(
    `/menu/sections/${sectionId}/image`,
    file,
  );
}
