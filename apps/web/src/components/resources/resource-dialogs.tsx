"use client";

import { Loader2, Plus, Trash2, X } from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";
import type { ResourceCategory, ResourceUnit } from "@/lib/resources-client";
import {
  GAME_BOOKING_TYPE_OPTIONS,
  defaultUnitNamePrefix,
  getBookingUnitKind,
  getBookingUnitLabels,
} from "@/lib/booking-unit-kind";
import {
  resourceStatusLabel,
  type ResourceStatus,
  type ResourceType,
} from "@/lib/resource-types";
import { resolveMediaUrl } from "@/lib/media-url";
import { ModalPortal } from "@/components/ui/modal-portal";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";
import { staffFloorT, type StaffFloorTranslate } from "@/lib/staff-floor-i18n";

function Shell({
  title,
  onClose,
  children,
  closeLabel = "Close",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  closeLabel?: string;
}) {
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[400] flex items-end justify-center sm:items-center sm:p-4">
        <button
          type="button"
          aria-label={closeLabel}
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        />
        <div className="relative z-10 flex max-h-[min(92vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-zinc-950 shadow-2xl sm:rounded-2xl">
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            <button type="button" onClick={onClose} className="text-zinc-400 hover:text-white">
              <X size={18} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        </div>
      </div>
    </ModalPortal>
  );
}

type RateRow = { label: string; durationMinutes: string; price: string };

export function CategoryDialog({
  category,
  onClose,
  onSave,
  onDelete,
  onUploadImage,
  saving,
}: {
  category?: ResourceCategory;
  onClose: () => void;
  onSave: (body: {
    type: ResourceType;
    name: string;
    description: string | null;
    slotMinutes: number;
    unitCount?: number;
    rates: { label: string; durationMinutes?: number; price: number }[];
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
  onUploadImage?: (slot: "1" | "2", file: File) => Promise<void>;
  saving: boolean;
}) {
  const vs = useVenueSettingsOptional();
  const t: StaffFloorTranslate = useMemo(
    () => vs?.t ?? staffFloorT(vs?.locale),
    [vs?.t, vs?.locale],
  );
  const currency = vs?.currency ?? "EUR";
  const [type, setType] = useState<ResourceType>(category?.type ?? "PC");
  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [slotMinutes, setSlotMinutes] = useState(String(category?.slotMinutes ?? 60));
  const defaultCount =
    getBookingUnitKind(type) === "LANE" ? "4" : getBookingUnitKind(type) === "SEAT" ? "8" : "4";
  const [unitCount, setUnitCount] = useState(category ? "" : defaultCount);
  const unitLabels = getBookingUnitLabels(getBookingUnitKind(type));
  const [rates, setRates] = useState<RateRow[]>(
    category?.rates.map((r) => ({
      label: r.label,
      durationMinutes: r.durationMinutes ? String(r.durationMinutes) : "",
      price: String(r.price),
    })) ?? [{ label: "Per hour", durationMinutes: "60", price: "" }],
  );
  const [uploading, setUploading] = useState<"1" | "2" | null>(null);

  return (
    <Shell
      title={
        category
          ? t("gamingSetup.dialogs.editOffering")
          : t("gamingSetup.dialogs.newOffering")
      }
      onClose={onClose}
      closeLabel={t("gamingSetup.dialogs.closeAria")}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void onSave({
            type,
            name: name.trim(),
            description: description.trim() || null,
            slotMinutes: parseInt(slotMinutes, 10) || 60,
            unitCount: category ? undefined : parseInt(unitCount, 10) || undefined,
            rates: rates
              .filter((r) => r.label && r.price)
              .map((r) => ({
                label: r.label,
                durationMinutes: r.durationMinutes
                  ? parseInt(r.durationMinutes, 10)
                  : undefined,
                price: parseFloat(r.price) || 0,
              })),
          });
        }}
      >
        <label className="block text-xs text-zinc-500">
          {t("gamingSetup.editor.gameTypeLabel")}
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ResourceType)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
          >
            <optgroup label={t("gamingSetup.dialogs.featuredGroup")}>
              {GAME_BOOKING_TYPE_OPTIONS.filter((o) => o.featured).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
            <optgroup label={t("gamingSetup.dialogs.moreGroup")}>
              {GAME_BOOKING_TYPE_OPTIONS.filter((o) => !o.featured).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          </select>
          <p className="mt-1 text-[11px] text-zinc-600">{unitLabels.layoutHint}</p>
        </label>
        <label className="block text-xs text-zinc-500">
          {t("gamingSetup.dialogs.nameLabel")}
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
            placeholder={
              type === "BOWLING"
                ? "e.g. Bowling Lanes"
                : type === "BILLIARD"
                  ? "e.g. Billiard Hall"
                  : type === "PLAYSTATION"
                    ? "e.g. PlayStation Lounge"
                    : "e.g. PC Gaming Zone"
            }
          />
        </label>
        <label className="block text-xs text-zinc-500">
          {t("gamingSetup.dialogs.descriptionLabel")}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
          />
        </label>
        {!category ? (
          <label className="block text-xs text-zinc-500">
            {unitLabels.createCountLabel}
            <input
              type="number"
              min={1}
              value={unitCount}
              onChange={(e) => setUnitCount(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
            />
            <p className="mt-1 text-[11px] text-zinc-600">
              {t("gamingSetup.dialogs.namePreviewHint", {
                prefix: defaultUnitNamePrefix(type, name || "…"),
              })}
            </p>
          </label>
        ) : null}
        <label className="block text-xs text-zinc-500">
          {t("gamingSetup.dialogs.slotLengthLabel")}
          <input
            type="number"
            min={15}
            value={slotMinutes}
            onChange={(e) => setSlotMinutes(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
          />
        </label>

        <div>
          <p className="text-xs text-zinc-500">
            {t("gamingSetup.dialogs.pricingOptionsLabel")}
          </p>
          <ul className="mt-2 space-y-2">
            {rates.map((r, i) => (
              <li key={i} className="flex items-center gap-2">
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
                  <input
                    placeholder={t("gamingSetup.editor.rateLabelPlaceholder")}
                    value={r.label}
                    onChange={(e) => {
                      const next = [...rates];
                      next[i] = { ...r, label: e.target.value };
                      setRates(next);
                    }}
                    className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-xs text-white sm:col-span-1"
                  />
                  <div className="grid grid-cols-2 gap-2 sm:contents">
                  <input
                    placeholder={t("gamingSetup.dialogs.rateMinsPlaceholder")}
                    value={r.durationMinutes}
                    onChange={(e) => {
                      const next = [...rates];
                      next[i] = { ...r, durationMinutes: e.target.value };
                      setRates(next);
                    }}
                    className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-xs text-white"
                  />
                  <input
                    placeholder={t("gamingSetup.dialogs.ratePriceCurrencyPlaceholder", {
                      currency,
                    })}
                    value={r.price}
                    onChange={(e) => {
                      const next = [...rates];
                      next[i] = { ...r, price: e.target.value };
                      setRates(next);
                    }}
                    className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-xs text-white"
                  />
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={t("gamingSetup.dialogs.removePriceTier")}
                  disabled={rates.length <= 1}
                  onClick={() => setRates(rates.filter((_, idx) => idx !== i))}
                  className="shrink-0 rounded-lg p-2 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() =>
              setRates([...rates, { label: "", durationMinutes: "60", price: "" }])
            }
            className="mt-2 text-xs text-emerald-400"
          >
            {t("gamingSetup.dialogs.addPriceTier")}
          </button>
        </div>

        {category && onUploadImage ? (
          <div className="grid grid-cols-2 gap-3">
            {(["1", "2"] as const).map((slot) => {
              const url = resolveMediaUrl(
                slot === "1" ? category.imageUrl : category.imageUrl2,
              );
              return (
                <div key={slot}>
                  <p className="text-[11px] text-zinc-500">
                    {t("gamingSetup.dialogs.photoLabel", { slot })}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="relative h-14 w-14 overflow-hidden rounded border border-white/10 bg-zinc-800">
                      {url ? (
                        <Image src={url} alt="" fill className="object-cover" unoptimized />
                      ) : null}
                    </div>
                    <label className="cursor-pointer text-xs text-emerald-400">
                      {uploading === slot ? "…" : t("gamingSetup.dialogs.upload")}
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          setUploading(slot);
                          void onUploadImage(slot, f).finally(() => setUploading(null));
                        }}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="flex gap-2 pt-2">
          {category && onDelete ? (
            <button
              type="button"
              onClick={() => void onDelete()}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-400/30 px-3 py-2 text-sm text-rose-300"
            >
              <Trash2 size={14} /> {t("gamingSetup.dialogs.deleteOffering")}
            </button>
          ) : null}
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="ml-auto rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {saving ? <Loader2 className="inline animate-spin" size={14} /> : null}{" "}
            {t("common.save")}
          </button>
        </div>
      </form>
    </Shell>
  );
}

export function AddUnitsDialog({
  categoryName,
  categoryType,
  onClose,
  onSave,
  saving,
}: {
  categoryName: string;
  categoryType: ResourceType;
  onClose: () => void;
  onSave: (count: number, prefix: string) => Promise<void>;
  saving: boolean;
}) {
  const vs = useVenueSettingsOptional();
  const t: StaffFloorTranslate = useMemo(
    () => vs?.t ?? staffFloorT(vs?.locale),
    [vs?.t, vs?.locale],
  );
  const labels = getBookingUnitLabels(getBookingUnitKind(categoryType));
  const [count, setCount] = useState("2");
  const [prefix, setPrefix] = useState(
    defaultUnitNamePrefix(categoryType, categoryName),
  );
  return (
    <Shell
      title={t("gamingSetup.dialogs.addUnitsTitle", { plural: labels.plural })}
      onClose={onClose}
      closeLabel={t("gamingSetup.dialogs.closeAria")}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void onSave(parseInt(count, 10) || 1, prefix.trim() || categoryName);
        }}
      >
        <label className="block text-xs text-zinc-500">
          {labels.createCountLabel.replace("create", "add")}
          <input
            type="number"
            min={1}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="block text-xs text-zinc-500">
          {t("gamingSetup.dialogs.namePrefixLabel", { singular: labels.singular })}
          <input
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
          />
        </label>
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-emerald-600 py-2 text-sm text-white"
        >
          {t("gamingSetup.dialogs.addUnitsTitle", { plural: labels.plural })}
        </button>
      </form>
    </Shell>
  );
}

export function UnitDialog({
  unit,
  onClose,
  onSave,
  onDelete,
  saving,
}: {
  unit: ResourceUnit;
  onClose: () => void;
  onSave: (body: {
    name: string;
    status: ResourceStatus;
    description: string | null;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
  saving: boolean;
}) {
  const vs = useVenueSettingsOptional();
  const t: StaffFloorTranslate = useMemo(
    () => vs?.t ?? staffFloorT(vs?.locale),
    [vs?.t, vs?.locale],
  );
  const [name, setName] = useState(unit.name);
  const [status, setStatus] = useState<ResourceStatus>(unit.status);
  const [description, setDescription] = useState(unit.description ?? "");

  return (
    <Shell
      title={t("gamingSetup.dialogs.editUnitTitle")}
      onClose={onClose}
      closeLabel={t("gamingSetup.dialogs.closeAria")}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void onSave({
            name: name.trim(),
            status,
            description: description.trim() || null,
          });
        }}
      >
        <label className="block text-xs text-zinc-500">
          {t("gamingSetup.dialogs.unitNameLabel")}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="block text-xs text-zinc-500">
          {t("gamingSetup.dialogs.floorStatusLabel")}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ResourceStatus)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
          >
            <option value="AVAILABLE">{resourceStatusLabel(t, "AVAILABLE")}</option>
            <option value="RESERVED">{resourceStatusLabel(t, "RESERVED")}</option>
            <option value="BUSY">{resourceStatusLabel(t, "BUSY")}</option>
            <option value="MAINTENANCE">{resourceStatusLabel(t, "MAINTENANCE")}</option>
          </select>
        </label>
        <label className="block text-xs text-zinc-500">
          {t("gamingSetup.dialogs.notesLabel")}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
          />
        </label>
        <div className="flex gap-2">
          {onDelete ? (
            <button
              type="button"
              onClick={() => void onDelete()}
              className="rounded-lg border border-rose-400/30 px-3 py-2 text-sm text-rose-300"
            >
              {t("gamingSetup.dialogs.deleteUnit")}
            </button>
          ) : null}
          <button
            type="submit"
            disabled={saving}
            className="ml-auto rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white"
          >
            {t("common.save")}
          </button>
        </div>
      </form>
    </Shell>
  );
}
