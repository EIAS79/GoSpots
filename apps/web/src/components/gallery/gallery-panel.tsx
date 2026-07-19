"use client";

import {
  ArrowDown,
  ArrowUp,
  ImagePlus,
  Loader2,
  Pencil,
  Save,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import {
  deleteGalleryItem,
  fetchGallery,
  updateGalleryItem,
  uploadGalleryCover,
  uploadGalleryItem,
  useGalleryItemAsCover,
  type GalleryItem,
} from "@/lib/gallery-client";
import { validateImageUploadFile } from "@/lib/image-upload";
import { resolveMediaUrl } from "@/lib/media-url";
import { VENUE_PLACEHOLDER_SRC } from "@/lib/venue-placeholder";

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [captionDraft, setCaptionDraft] = useState("");
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
      await uploadGalleryCover(file);
      await load();
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
      await uploadGalleryItem(file);
      await load();
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

  async function onSaveCaption(id: string) {
    if (!canWrite) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateGalleryItem(id, {
        caption: captionDraft.trim() || null,
      });
      setItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
      setEditingId(null);
      setCaptionDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save caption.");
    } finally {
      setBusy(false);
    }
  }

  async function onMove(item: GalleryItem, direction: -1 | 1) {
    if (!canWrite) return;
    const index = items.findIndex((entry) => entry.id === item.id);
    const swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= items.length) return;
    const other = items[swapIndex];
    setBusy(true);
    setError(null);
    try {
      await Promise.all([
        updateGalleryItem(item.id, { sortOrder: other.sortOrder }),
        updateGalleryItem(other.id, { sortOrder: item.sortOrder }),
      ]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reorder gallery.");
    } finally {
      setBusy(false);
    }
  }

  const coverUrl = resolveMediaUrl(coverImage) ?? VENUE_PLACEHOLDER_SRC;

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
            <div className="mt-2 h-28 w-full max-w-xs overflow-hidden rounded-lg border border-white/10 bg-zinc-950 sm:h-32">
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {items.map((item, index) => {
              const url = resolveMediaUrl(item.imageUrl);
              if (!url) return null;
              return (
                <article
                  key={item.id}
                  className="rounded-lg border border-white/10 bg-zinc-950/70 p-2"
                >
                  <div className="group relative aspect-square overflow-hidden rounded-md border border-white/10 bg-zinc-950">
                    <Thumb src={url} alt={item.caption ?? "Gallery"} />
                    {canWrite ? (
                      <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-0.5 bg-black/50 p-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            title="Move up"
                            disabled={busy || index === 0}
                            onClick={() => void onMove(item, -1)}
                            className="rounded bg-white/15 p-1 text-zinc-100 disabled:opacity-40"
                          >
                            <ArrowUp size={11} />
                          </button>
                          <button
                            type="button"
                            title="Move down"
                            disabled={busy || index === items.length - 1}
                            onClick={() => void onMove(item, 1)}
                            className="rounded bg-white/15 p-1 text-zinc-100 disabled:opacity-40"
                          >
                            <ArrowDown size={11} />
                          </button>
                        </div>
                        <div className="flex gap-1">
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
                            title="Edit caption"
                            disabled={busy}
                            onClick={() => {
                              setEditingId(item.id);
                              setCaptionDraft(item.caption ?? "");
                            }}
                            className="rounded bg-white/15 p-1 text-sky-200"
                          >
                            <Pencil size={11} />
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
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-2">
                    {editingId === item.id ? (
                      <div className="space-y-2">
                        <input
                          value={captionDraft}
                          onChange={(e) => setCaptionDraft(e.target.value)}
                          placeholder="Add a caption"
                          className="w-full rounded-md border border-white/10 bg-zinc-900 px-2.5 py-2 text-xs text-white"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void onSaveCaption(item.id)}
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] text-white disabled:opacity-50"
                          >
                            <Save size={11} />
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setCaptionDraft("");
                            }}
                            className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-300"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={!canWrite}
                        onClick={() => {
                          if (!canWrite) return;
                          setEditingId(item.id);
                          setCaptionDraft(item.caption ?? "");
                        }}
                        className={cn(
                          "line-clamp-2 text-left text-xs leading-relaxed",
                          canWrite
                            ? "text-zinc-400 hover:text-zinc-200"
                            : "text-zinc-500",
                        )}
                      >
                        {item.caption?.trim() || "Add a caption"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
