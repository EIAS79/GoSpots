import { ApiError, credentialedFetch } from "./api";

export type GalleryItem = {
  id: string;
  imageUrl: string;
  caption: string | null;
  sortOrder: number;
  createdAt?: string;
};

export type GalleryResponse = {
  coverImage: string | null;
  items: GalleryItem[];
};

export function fetchGallery() {
  return import("./api").then(({ api }) => api<GalleryResponse>("/gallery"));
}

async function uploadMultipart(
  path: string,
  file: File,
  fields?: Record<string, string>,
) {
  const form = new FormData();
  form.append("file", file);
  if (fields) {
    for (const [k, v] of Object.entries(fields)) {
      form.append(k, v);
    }
  }
  const res = await credentialedFetch(path, {
    method: "POST",
    body: form,
  });
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
  return res.json();
}

export function uploadGalleryCover(file: File) {
  return uploadMultipart("/gallery/cover", file) as Promise<{
    coverImage: string;
  }>;
}

export function uploadGalleryItem(file: File, caption?: string) {
  return uploadMultipart("/gallery/items", file, caption ? { caption } : undefined) as Promise<GalleryItem>;
}

export function updateGalleryItem(
  id: string,
  body: { caption?: string | null; sortOrder?: number },
) {
  return import("./api").then(({ api }) =>
    api<GalleryItem>(`/gallery/items/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  );
}

export function deleteGalleryItem(id: string) {
  return import("./api").then(({ api }) =>
    api<{ ok: boolean }>(`/gallery/items/${id}`, { method: "DELETE" }),
  );
}

export function useGalleryItemAsCover(id: string) {
  return import("./api").then(({ api }) =>
    api<{ coverImage: string }>(`/gallery/items/${id}/use-as-cover`, {
      method: "POST",
    }),
  );
}
