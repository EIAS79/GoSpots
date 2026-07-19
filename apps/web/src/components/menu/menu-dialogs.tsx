"use client";

import { ImagePlus, Loader2, Trash2, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import {
  MEAL_PERIOD_PRESETS,
  type MealPeriod,
} from "@/lib/menu-periods";
import type { MenuItem, MenuSection } from "@/lib/menu-client";
import { validateImageUploadFile } from "@/lib/image-upload";
import { resolveMediaUrl } from "@/lib/media-url";
import { sectionTimingLabel } from "@/lib/menu-timing";
import { ModalPortal } from "@/components/ui/modal-portal";

const WEEKDAYS = [
  { v: 0, label: "Sun" },
  { v: 1, label: "Mon" },
  { v: 2, label: "Tue" },
  { v: 3, label: "Wed" },
  { v: 4, label: "Thu" },
  { v: 5, label: "Fri" },
  { v: 6, label: "Sat" },
];

function DialogShell({
  title,
  onClose,
  panelClassName,
  children,
}: {
  title: string;
  onClose: () => void;
  panelClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[400] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative z-10 flex max-h-[min(92vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-zinc-950 shadow-2xl sm:rounded-2xl",
          panelClassName,
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-white/5 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
          {children}
        </div>
      </div>
      </div>
    </ModalPortal>
  );
}

function WeekdayPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (csv: string) => void;
}) {
  const selected = new Set(
    value.split(",").map((d) => parseInt(d.trim(), 10)),
  );
  return (
    <div className="flex flex-wrap gap-1.5">
      {WEEKDAYS.map((d) => {
        const on = selected.has(d.v);
        return (
          <button
            key={d.v}
            type="button"
            onClick={() => {
              const next = new Set(selected);
              if (on) next.delete(d.v);
              else next.add(d.v);
              onChange(
                [...next].sort((a, b) => a - b).join(",") || "0",
              );
            }}
            className={cn(
              "rounded-md px-2 py-1 text-xs",
              on
                ? "bg-emerald-500/20 text-emerald-200"
                : "bg-white/5 text-zinc-500",
            )}
          >
            {d.label}
          </button>
        );
      })}
    </div>
  );
}

export function SectionDialog({
  section,
  onClose,
  onSave,
  onSaved,
  onDelete,
  onUploadImage,
  onClearImage,
  saving,
}: {
  section?: MenuSection;
  onClose: () => void;
  onSave: (body: {
    name: string;
    mealPeriod: MealPeriod | null;
    availableFrom: string | null;
    availableTo: string | null;
    availableDays: string;
  }) => Promise<MenuSection | void>;
  onSaved?: () => void;
  onDelete?: () => void | Promise<void>;
  onUploadImage?: (sectionId: string, file: File) => Promise<void>;
  onClearImage?: () => Promise<void>;
  saving: boolean;
}) {
  const [name, setName] = useState(section?.name ?? "");
  const [imageUrl, setImageUrl] = useState(section?.imageUrl ?? null);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [mealPeriod, setMealPeriod] = useState<MealPeriod | "">(
    (section?.mealPeriod as MealPeriod) ?? "",
  );
  const [availableFrom, setAvailableFrom] = useState(
    section?.availableFrom ?? "",
  );
  const [availableTo, setAvailableTo] = useState(section?.availableTo ?? "");
  const [availableDays, setAvailableDays] = useState(
    section?.availableDays ?? "0,1,2,3,4,5,6",
  );

  useEffect(() => {
    setImageUrl(section?.imageUrl ?? null);
  }, [section?.imageUrl]);

  useEffect(() => {
    if (!pendingImage) {
      setPreviewImage(null);
      return;
    }
    const url = URL.createObjectURL(pendingImage);
    setPreviewImage(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingImage]);

  useEffect(() => {
    if (!mealPeriod) return;
    const preset = MEAL_PERIOD_PRESETS.find((p) => p.value === mealPeriod);
    if (preset && !section) {
      setAvailableFrom(preset.from);
      setAvailableTo(preset.to);
    }
  }, [mealPeriod, section]);

  return (
    <DialogShell
      title={section ? "Edit section" : "New section"}
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void onSave({
            name: name.trim(),
            mealPeriod: mealPeriod || null,
            availableFrom: availableFrom ? availableFrom.slice(0, 5) : null,
            availableTo: availableTo ? availableTo.slice(0, 5) : null,
            availableDays,
          }).then(async (saved) => {
            if (!saved?.id) return;
            onClose();
            if (pendingImage && onUploadImage) {
              setUploadingImage(true);
              try {
                await onUploadImage(saved.id, pendingImage);
                setPendingImage(null);
              } catch (err) {
                window.alert(
                  err instanceof Error
                    ? err.message
                    : "Could not upload section photo.",
                );
                onSaved?.();
                return;
              } finally {
                setUploadingImage(false);
              }
            }
            onSaved?.();
          }).catch((err) => {
            window.alert(
              err instanceof Error ? err.message : "Could not save section.",
            );
          });
        }}
      >
        <label className="block text-xs text-zinc-500">
          Section name
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
            placeholder="e.g. Drinks, Food, Desserts"
          />
        </label>

        <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-4">
          <p className="text-sm font-medium text-zinc-200">Section photo</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Optional cover for this category — max 8 MB.
            {!section && pendingImage ? " Uploads after you save." : null}
          </p>
          <div className="mt-3 max-w-xs">
            <MenuPhotoUpload
              slotLabel="Cover"
              previewPath={
                section ? imageUrl ?? previewImage : previewImage
              }
              uploading={uploadingImage || (!!section && !!pendingImage)}
              onPick={(f) => {
                const err = validateImageUploadFile(f);
                if (err) {
                  window.alert(err);
                  return;
                }
                if (section && onUploadImage) {
                  setUploadingImage(true);
                  void onUploadImage(section.id, f)
                    .then(() => setPendingImage(null))
                    .catch((err) => {
                      window.alert(
                        err instanceof Error
                          ? err.message
                          : "Could not upload section photo.",
                      );
                    })
                    .finally(() => setUploadingImage(false));
                } else {
                  setPendingImage(f);
                }
              }}
              onClear={() => {
                if (section && onClearImage) {
                  setImageUrl(null);
                  void onClearImage();
                } else {
                  setPendingImage(null);
                }
              }}
            />
          </div>
        </div>

        <label className="block text-xs text-zinc-500">
          Service period (optional)
          <select
            value={mealPeriod}
            onChange={(e) => {
              const v = e.target.value as MealPeriod | "";
              setMealPeriod(v);
              if (v) {
                const preset = MEAL_PERIOD_PRESETS.find((p) => p.value === v);
                if (preset) {
                  setAvailableFrom(preset.from);
                  setAvailableTo(preset.to);
                }
              }
            }}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
          >
            <option value="">No preset</option>
            {MEAL_PERIOD_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-zinc-500">
            From
            <input
              type="time"
              value={availableFrom}
              onChange={(e) => setAvailableFrom(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-zinc-500">
            To
            <input
              type="time"
              value={availableTo}
              onChange={(e) => setAvailableTo(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <div>
          <p className="text-xs text-zinc-500">Available days</p>
          <div className="mt-2">
            <WeekdayPicker value={availableDays} onChange={setAvailableDays} />
          </div>
        </div>

        <p className="text-[11px] text-zinc-600">
          Items can inherit this window when &quot;Use section hours&quot; is
          enabled on the item.
        </p>

        <div className="flex flex-wrap gap-2 pt-2">
          {section && onDelete ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void onDelete()}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-400/30 px-3 py-2 text-sm text-rose-300 hover:bg-rose-500/10"
            >
              <Trash2 size={14} />
              Delete
            </button>
          ) : null}
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            Save section
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

function photoDisplayUrl(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("blob:")) return path;
  return resolveMediaUrl(path);
}

function MenuPhotoUpload({
  slotLabel,
  previewPath,
  uploading,
  onPick,
  onClear,
}: {
  slotLabel: string;
  previewPath: string | null;
  uploading: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  const src = photoDisplayUrl(previewPath);
  return (
    <label
      className={cn(
        "group relative flex min-h-[132px] cursor-pointer flex-col overflow-hidden rounded-xl border border-dashed border-white/15 bg-zinc-900/60 transition-colors hover:border-emerald-500/35 hover:bg-zinc-900",
        src && "border-solid border-white/10",
      )}
    >
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
      {src ? (
        <div className="relative aspect-[4/3] w-full">
          <Image
            src={src}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 640px) 50vw, 240px"
            unoptimized
          />
          {uploading ? (
            <span className="absolute inset-0 grid place-items-center bg-black/60">
              <Loader2 size={22} className="animate-spin text-emerald-300" />
            </span>
          ) : null}
        </div>
      ) : (
        <span className="flex flex-1 flex-col items-center justify-center gap-2 px-3 py-6 text-center">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-white/5 text-zinc-400 group-hover:text-emerald-300">
            <ImagePlus size={20} />
          </span>
          <span className="text-xs text-zinc-400 group-hover:text-zinc-200">
            Click to add {slotLabel}
          </span>
        </span>
      )}
      <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
        {slotLabel} · optional
      </span>
      {src && !uploading ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClear();
          }}
          className="absolute right-2 top-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] text-zinc-300 hover:text-rose-300"
        >
          Remove
        </button>
      ) : null}
    </label>
  );
}

export function ItemDialog({
  item,
  sections,
  defaultSectionId,
  onClose,
  onSave,
  onSaved,
  onDelete,
  onUploadImage,
  saving,
}: {
  item?: MenuItem;
  sections: MenuSection[];
  defaultSectionId: string | null;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => Promise<MenuItem | void>;
  onSaved?: () => void;
  onDelete?: () => void | Promise<void>;
  onUploadImage: (
    itemId: string,
    slot: "1" | "2",
    file: File,
  ) => Promise<void>;
  saving: boolean;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [price, setPrice] = useState(String(item?.price ?? ""));
  const [sectionId, setSectionId] = useState(
    item?.sectionId ?? defaultSectionId ?? "",
  );
  const [trackStock, setTrackStock] = useState(item?.trackStock ?? false);
  const [stock, setStock] = useState(String(item?.stock ?? 0));
  const [useSectionTiming, setUseSectionTiming] = useState(
    item?.useSectionTiming ?? true,
  );
  const [availableFrom, setAvailableFrom] = useState(
    item?.availableFrom ?? "",
  );
  const [availableTo, setAvailableTo] = useState(item?.availableTo ?? "");
  const [availableDays, setAvailableDays] = useState(
    item?.availableDays ?? "0,1,2,3,4,5,6",
  );
  const [isAvailable, setIsAvailable] = useState(item?.isAvailable ?? true);
  const [uploadingSlot, setUploadingSlot] = useState<"1" | "2" | null>(null);
  const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? null);
  const [imageUrl2, setImageUrl2] = useState(item?.imageUrl2 ?? null);
  const [pending1, setPending1] = useState<File | null>(null);
  const [pending2, setPending2] = useState<File | null>(null);
  const [preview1, setPreview1] = useState<string | null>(null);
  const [preview2, setPreview2] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    setImageUrl(item?.imageUrl ?? null);
    setImageUrl2(item?.imageUrl2 ?? null);
  }, [item?.imageUrl, item?.imageUrl2]);

  useEffect(() => {
    if (!pending1) {
      setPreview1(null);
      return;
    }
    const url = URL.createObjectURL(pending1);
    setPreview1(url);
    return () => URL.revokeObjectURL(url);
  }, [pending1]);

  useEffect(() => {
    if (!pending2) {
      setPreview2(null);
      return;
    }
    const url = URL.createObjectURL(pending2);
    setPreview2(url);
    return () => URL.revokeObjectURL(url);
  }, [pending2]);

  const selectedSection = sections.find((s) => s.id === sectionId);

  useEffect(() => {
    if (!sectionId && useSectionTiming) setUseSectionTiming(false);
  }, [sectionId, useSectionTiming]);

  async function handleUpload(slot: "1" | "2", file: File) {
    if (!item) return;
    const validationError = validateImageUploadFile(file);
    if (validationError) {
      window.alert(validationError);
      return;
    }
    setUploadingSlot(slot);
    try {
      await onUploadImage(item.id, slot, file);
      /* parent reloads item; local preview updates on next open */
    } finally {
      setUploadingSlot(null);
    }
  }

  return (
    <DialogShell
      title={item ? "Edit item" : "New item"}
      panelClassName="max-w-xl"
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!item && !sectionId) {
            window.alert("Choose a section — items must belong to a category.");
            return;
          }
          void onSave({
            name: name.trim(),
            description: description.trim() || null,
            price: parseFloat(price) || 0,
            sectionId: sectionId || null,
            trackStock,
            stock: trackStock ? parseInt(stock, 10) || 0 : 0,
            useSectionTiming,
            isAvailable,
            availableFrom: useSectionTiming
              ? null
              : availableFrom
                ? availableFrom.slice(0, 5)
                : null,
            availableTo: useSectionTiming
              ? null
              : availableTo
                ? availableTo.slice(0, 5)
                : null,
            availableDays: useSectionTiming ? undefined : availableDays,
          })
            .then(async (saved) => {
              if (!saved?.id) return;
              onClose();
              const jobs: Promise<void>[] = [];
              if (pending1) jobs.push(onUploadImage(saved.id, "1", pending1));
              if (pending2) jobs.push(onUploadImage(saved.id, "2", pending2));
              if (jobs.length) {
                setUploadingImage(true);
                try {
                  await Promise.all(jobs);
                } catch (err) {
                  window.alert(
                    err instanceof Error
                      ? err.message
                      : "Item saved but photo upload failed.",
                  );
                } finally {
                  setUploadingImage(false);
                }
              }
              onSaved?.();
            })
            .catch((err) => {
              window.alert(
                err instanceof Error ? err.message : "Could not save item.",
              );
            });
        }}
      >
        <label className="block text-xs text-zinc-500">
          Name
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
          />
        </label>

        <label className="block text-xs text-zinc-500">
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-zinc-500">
            Price
            <input
              required
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-zinc-500">
            Section
            <select
              required
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
            >
              {!item ? (
                <option value="" disabled>
                  Select section…
                </option>
              ) : (
                <option value="">Uncategorized</option>
              )}
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-4">
          <p className="text-sm font-medium text-zinc-200">Photos</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Optional — up to 2 images, max 8 MB each (compressed when saved).
            {!item && (pending1 || pending2)
              ? " They upload right after you save."
              : null}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <MenuPhotoUpload
              slotLabel="Photo 1"
              previewPath={item ? imageUrl ?? preview1 : preview1}
              uploading={uploadingSlot === "1" || (!!item && !!pending1)}
              onPick={(f) => {
                const err = validateImageUploadFile(f);
                if (err) {
                  window.alert(err);
                  return;
                }
                if (item) void handleUpload("1", f);
                else setPending1(f);
              }}
              onClear={() => {
                if (item) {
                  setImageUrl(null);
                  void onSave({ imageUrl: null });
                } else setPending1(null);
              }}
            />
            <MenuPhotoUpload
              slotLabel="Photo 2"
              previewPath={item ? imageUrl2 ?? preview2 : preview2}
              uploading={uploadingSlot === "2" || (!!item && !!pending2)}
              onPick={(f) => {
                const err = validateImageUploadFile(f);
                if (err) {
                  window.alert(err);
                  return;
                }
                if (item) void handleUpload("2", f);
                else setPending2(f);
              }}
              onClear={() => {
                if (item) {
                  setImageUrl2(null);
                  void onSave({ imageUrl2: null });
                } else setPending2(null);
              }}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={trackStock}
            onChange={(e) => setTrackStock(e.target.checked)}
            className="rounded border-white/20"
          />
          Track stock for this item
        </label>

        {trackStock ? (
          <label className="block text-xs text-zinc-500">
            Quantity in stock
            <input
              type="number"
              min={0}
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
            />
          </label>
        ) : null}

        <fieldset className="space-y-3 rounded-lg border border-white/10 bg-zinc-900/40 p-4">
          <legend className="px-1 text-sm font-medium text-white">
            When guests see this item
          </legend>
          <p className="text-[11px] leading-relaxed text-zinc-500">
            Pick a section above: use its schedule, or set custom times for this
            item only.
          </p>
          <label
            className={cn(
              "flex cursor-pointer gap-3 rounded-lg border p-3",
              useSectionTiming
                ? "border-emerald-500/40 bg-emerald-500/5"
                : "border-white/10",
              !sectionId && "cursor-not-allowed opacity-50",
            )}
          >
            <input
              type="radio"
              name="item-timing"
              className="mt-0.5"
              checked={useSectionTiming}
              disabled={!sectionId}
              onChange={() => setUseSectionTiming(true)}
            />
            <span className="min-w-0 flex-1 text-sm">
              <span className="text-zinc-200">Same as section</span>
              <span className="mt-0.5 block text-xs text-zinc-500">
                Uses section hours (breakfast / lunch, etc.).
              </span>
              {useSectionTiming && selectedSection ? (
                <span className="mt-2 block rounded-md border border-white/10 bg-zinc-950/80 px-2 py-1.5 text-xs text-zinc-300">
                  {selectedSection.name}:{" "}
                  {sectionTimingLabel(selectedSection) ??
                    "No section hours — shows all day"}
                </span>
              ) : null}
              {!sectionId ? (
                <span className="mt-1 block text-xs text-amber-500/90">
                  Select a section first.
                </span>
              ) : null}
            </span>
          </label>
          <label
            className={cn(
              "flex cursor-pointer gap-3 rounded-lg border p-3",
              !useSectionTiming
                ? "border-emerald-500/40 bg-emerald-500/5"
                : "border-white/10",
            )}
          >
            <input
              type="radio"
              name="item-timing"
              className="mt-0.5"
              checked={!useSectionTiming}
              onChange={() => setUseSectionTiming(false)}
            />
            <span className="text-sm">
              <span className="text-zinc-200">Custom for this item only</span>
              <span className="mt-0.5 block text-xs text-zinc-500">
                Ignores section hours.
              </span>
            </span>
          </label>

        {!useSectionTiming ? (
          <div className="space-y-3 border-t border-white/10 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-zinc-500">
                From
                <input
                  type="time"
                  value={availableFrom}
                  onChange={(e) => setAvailableFrom(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="block text-xs text-zinc-500">
                To
                <input
                  type="time"
                  value={availableTo}
                  onChange={(e) => setAvailableTo(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
              </label>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Days</p>
              <div className="mt-2">
                <WeekdayPicker
                  value={availableDays}
                  onChange={setAvailableDays}
                />
              </div>
            </div>
          </div>
        ) : null}
        </fieldset>

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={isAvailable}
            onChange={(e) => setIsAvailable(e.target.checked)}
            className="rounded border-white/20"
          />
          Visible on menu
        </label>

        <div className="flex flex-wrap gap-2 pt-2">
          {item && onDelete ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void onDelete()}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-400/30 px-3 py-2 text-sm text-rose-300 hover:bg-rose-500/10"
            >
              <Trash2 size={14} />
              Delete item
            </button>
          ) : null}
          <button
            type="submit"
            disabled={saving || uploadingImage || !name.trim()}
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {saving || uploadingImage ? (
              <Loader2 size={14} className="animate-spin" />
            ) : null}
            {item
              ? "Save changes"
              : pending1 || pending2
                ? "Save & upload photos"
                : "Save item"}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}
