"use client";

import {
  ImagePlus,
  Loader2,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import {
  deleteGalleryItem,
  fetchGallery,
  uploadGalleryCover,
  uploadGalleryItem,
  useGalleryItemAsCover,
  type GalleryItem,
} from "@/lib/gallery-client";
import { validateImageUploadFile } from "@/lib/image-upload";
import { resolveMediaUrl } from "@/lib/media-url";

const PLACEHOLDER =
  "https://images.unsplash.com/photo-1615722440048-da4fd9202b9d?auto=format&fit=crop&w=600&q=70";

function Thumb({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={cn("h-full w-full object-cover", className)}
    />
  );
}

export function GalleryPanel({ canWrite }: { canWrite: boolean }) {
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchGallery();
      setCoverImage(data.coverImage);
      setItems(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load gallery.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCoverFile(file: File) {
    if (!canWrite) return;
    const validationError = validateImageUploadFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await uploadGalleryCover(file);
      setCoverImage(res.coverImage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cover upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onGalleryFile(file: File) {
    if (!canWrite) return;
    const validationError = validateImageUploadFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const item = await uploadGalleryItem(file);
      setItems((prev) => [...prev, item]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!canWrite || !confirm("Remove this photo?")) return;
    setBusy(true);
    try {
      await deleteGalleryItem(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onUseAsCover(id: string) {
    if (!canWrite) return;
    setBusy(true);
    try {
      const res = await useGalleryItemAsCover(id);
      setCoverImage(res.coverImage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not set cover.");
    } finally {
      setBusy(false);
    }
  }

  const coverUrl = resolveMediaUrl(coverImage) ?? PLACEHOLDER;

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-6 animate-spin text-emerald-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {error ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </p>
      ) : null}

      <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="shrink-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Marketing cover
            </p>
            <div className="mt-2 h-28 w-44 overflow-hidden rounded-lg border border-white/10 bg-zinc-950 sm:h-32 sm:w-52">
              <Thumb src={coverUrl} alt="Cover" />
            </div>
            {canWrite ? (
              <>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onCoverFile(f);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => coverInputRef.current?.click()}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] text-zinc-300 hover:bg-white/5 disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Upload size={12} />
                  )}
                  Replace cover
                </button>
              </>
            ) : null}
          </div>
          <p className="text-xs leading-relaxed text-zinc-500 sm:pt-5">
            Used on the marketing homepage and as the hero on{" "}
            <span className="text-zinc-400">/venue/your-slug</span>. Gallery
            photos below are shown separately on your public page.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Public gallery
            </p>
            <p className="text-xs text-zinc-600">
              {items.length} photo{items.length === 1 ? "" : "s"} · max 8 MB upload each
            </p>
          </div>
          {canWrite ? (
            <>
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onGalleryFile(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => galleryInputRef.current?.click()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                <ImagePlus size={12} />
                Add
              </button>
            </>
          ) : null}
        </div>

        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/10 py-8 text-center">
            <p className="text-xs text-zinc-500">No gallery photos yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6">
            {items.map((item) => {
              const url = resolveMediaUrl(item.imageUrl);
              if (!url) return null;
              return (
                <article
                  key={item.id}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-zinc-950"
                >
                  <Thumb src={url} alt={item.caption ?? "Gallery"} />
                  {canWrite ? (
                    <div className="absolute inset-0 flex items-end justify-between gap-0.5 bg-black/50 p-1 opacity-0 transition group-hover:opacity-100">
                      <button
                        type="button"
                        title="Set as cover"
                        disabled={busy}
                        onClick={() => void onUseAsCover(item.id)}
                        className="rounded bg-white/15 p-1 text-amber-200"
                      >
                        <Star size={11} />
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        disabled={busy}
                        onClick={() => void onDelete(item.id)}
                        className="rounded bg-white/15 p-1 text-rose-200"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
