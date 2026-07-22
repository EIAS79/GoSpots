"use client";

import { Loader2, Trash2, Upload, X } from "lucide-react";
import { useMemo, useState } from "react";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { MediaImage } from "@/components/ui/media-image";
import { ModalPortal } from "@/components/ui/modal-portal";
import {
  formatImageSize,
  RESOURCE_IMAGE_ACCEPT,
  RESOURCE_IMAGE_MAX_BYTES,
  validateResourceImageFile,
} from "@/lib/image-upload";
import {
  GAMING_DEFAULT_NAMES,
  GAMING_SPEC_PLACEHOLDERS,
  FEATURED_GAME_TYPES,
  getBookingUnitKind,
  getBookingUnitLabels,
} from "@/lib/booking-unit-kind";
import type { ResourceType } from "@/lib/resource-types";
import {
  FULL_DAY_DURATION_MINUTES,
  GAMING_PRICE_PRESETS,
  type GamingOffering,
} from "@/lib/gaming-menu-client";
import type { BookingMode } from "@/lib/resources-client";
import { resourceTypeLabel } from "@/lib/resource-types";
import {
  BowlingModesEditor,
  bowlingModeToDraft,
  draftToBowlingMode,
  type BowlingModeDraft,
} from "@/components/gaming/bowling-modes-editor";
import {
  createBowlingMode,
  inferBookingModeFromModes,
  listBowlingModes,
  serializeBowlingModes,
} from "@/lib/bowling-modes";
import { DINING_DEFAULT_SLOT_MINUTES } from "@/lib/dining-layout";
import {
  NO_SHOW_OPTIONS,
  parseNoShowMinutes,
} from "@/lib/dining-reservation";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";
import { staffFloorT } from "@/lib/staff-floor-i18n";

type RateRow = { label: string; durationMinutes: string; price: string };

export type GamingOfferingSaveBody = {
  type: ResourceType;
  name: string;
  description: string | null;
  slotMinutes: number;
  totalUnits: number;
  bookingMode: BookingMode;
  playstationGames: string[];
  offeringConfig?: Record<string, unknown>;
  rates: { label: string; durationMinutes?: number; price: number }[];
};

export function GamingOfferingEditor({
  offering,
  initialType,
  variant = "gaming",
  saving,
  onClose,
  onSave,
  onDelete,
  onUploadImage,
}: {
  offering?: GamingOffering;
  initialType?: ResourceType;
  variant?: "gaming" | "dining";
  saving: boolean;
  onClose: () => void;
  onSave: (body: GamingOfferingSaveBody, imageFile?: File | null) => Promise<void>;
  onDelete?: () => Promise<void>;
  onUploadImage?: (slot: "1" | "2", file: File) => Promise<string | null>;
}) {
  const vs = useVenueSettingsOptional();
  const t = useMemo(
    () => vs?.t ?? staffFloorT(vs?.locale),
    [vs?.t, vs?.locale],
  );
  const isNew = !offering;
  const isDiningEditor = variant === "dining" || offering?.type === "DINING";
  const [type, setType] = useState<ResourceType>(
    offering?.type ?? initialType ?? (isDiningEditor ? "DINING" : "PC"),
  );
  const labels = getBookingUnitLabels(getBookingUnitKind(type));
  const [name, setName] = useState(
    offering?.name ?? GAMING_DEFAULT_NAMES[type] ?? "",
  );
  const [description, setDescription] = useState(offering?.description ?? "");
  const [slotMinutes, setSlotMinutes] = useState(
    String(offering?.slotMinutes ?? (isDiningEditor ? 90 : 60)),
  );
  const [noShowMinutes, setNoShowMinutes] = useState(
    String(parseNoShowMinutes(offering?.offeringConfig ?? null)),
  );
  const [bookingMode, setBookingMode] = useState<BookingMode>(
    offering?.bookingMode ?? (type === "BOWLING" ? "TIME" : "TIME"),
  );
  const [bowlingModeDrafts, setBowlingModeDrafts] = useState<BowlingModeDraft[]>(
    () =>
      type === "BOWLING" || offering?.type === "BOWLING"
        ? listBowlingModes(
            offering?.offeringConfig ?? null,
            offering?.bookingMode,
            offering?.rates ?? [],
            offering?.slotMinutes ?? 60,
          ).map(bowlingModeToDraft)
        : [bowlingModeToDraft(createBowlingMode("TIME", 60))],
  );
  const [totalUnits, setTotalUnits] = useState(
    String(offering?.inventory.total ?? (getBookingUnitKind(type) === "SEAT" ? 8 : 4)),
  );
  const [rates, setRates] = useState<RateRow[]>(
    offering?.rates.length
      ? offering.rates.map((r) => ({
          label: r.label,
          durationMinutes: r.durationMinutes ? String(r.durationMinutes) : "",
          price: String(r.price),
        }))
      : [{ label: "Per hour", durationMinutes: "60", price: "" }],
  );
  const [ps5GamesText, setPs5GamesText] = useState(
    offering?.playstationGames.join("\n") ?? "",
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [uploadedImageUrl2, setUploadedImageUrl2] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<{
    variant: "error" | "success";
    message: string;
  } | null>(null);

  const localPreview = useMemo(
    () => (imageFile ? URL.createObjectURL(imageFile) : null),
    [imageFile],
  );
  const remotePreview = uploadedImageUrl ?? offering?.imageUrl ?? null;
  const remotePreview2 = uploadedImageUrl2 ?? offering?.imageUrl2 ?? null;

  async function pickImage(slot: "1" | "2", file: File) {
    const validationError = validateResourceImageFile(file);
    if (validationError) {
      setFeedback({ variant: "error", message: validationError });
      return;
    }
    setFeedback(null);
    if (slot === "2" && !offering) {
      setFeedback({
        variant: "error",
        message: t("gamingSetup.editor.secondPhotoHint"),
      });
      return;
    }
    if (offering && onUploadImage) {
      setUploading(true);
      try {
        const url = await onUploadImage(slot, file);
        if (url) {
          if (slot === "1") setUploadedImageUrl(url);
          else setUploadedImageUrl2(url);
        }
        if (slot === "1") setImageFile(null);
        setFeedback({
          variant: "success",
          message: t("gamingSetup.editor.photoUpdated"),
        });
      } catch (e) {
        setFeedback({
          variant: "error",
          message:
            e instanceof Error
              ? e.message
              : t("gamingSetup.editor.photoUploadFailed"),
        });
      } finally {
        setUploading(false);
      }
    } else if (slot === "1") {
      setImageFile(file);
    }
  }

  const specPlaceholder =
    GAMING_SPEC_PLACEHOLDERS[type] ?? t("gamingSetup.editor.specPlaceholder");

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[400] flex items-end justify-center sm:items-center sm:p-4">
        <button
          type="button"
          aria-label={t("gamingSetup.dialogs.closeAria")}
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        />
        <div className="relative z-10 flex max-h-[min(92vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-zinc-950 shadow-2xl sm:rounded-2xl">
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
            <h2 className="text-lg font-semibold text-white">
              {isNew
                ? isDiningEditor
                  ? t("gamingSetup.editor.titleAddDining")
                  : t("gamingSetup.editor.titleAddGame")
                : isDiningEditor
                  ? t("gamingSetup.editor.titleEditDining")
                  : t("gamingSetup.editor.titleEditGame")}
            </h2>
            <button type="button" onClick={onClose} className="text-zinc-400">
              <X size={18} />
            </button>
          </div>

          <form
            className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5"
            onSubmit={(e) => {
              e.preventDefault();
              setFeedback(null);
              void onSave(
                (() => {
                  const parsedSlot = isDiningEditor
                    ? DINING_DEFAULT_SLOT_MINUTES
                    : parseInt(slotMinutes, 10) || 60;
                  const bowlingModes =
                    type === "BOWLING"
                      ? bowlingModeDrafts.map(draftToBowlingMode)
                      : [];
                  const resolvedBookingMode =
                    type === "BOWLING"
                      ? inferBookingModeFromModes(bowlingModes)
                      : bookingMode;
                  return {
                  type,
                  name: name.trim(),
                  description: description.trim() || null,
                  slotMinutes: parsedSlot,
                  totalUnits: isDiningEditor
                    ? 0
                    : Math.max(0, parseInt(totalUnits, 10) || 0),
                  bookingMode: resolvedBookingMode,
                  playstationGames:
                    type === "PLAYSTATION"
                      ? ps5GamesText
                          .split("\n")
                          .map((game) => game.trim())
                          .filter(Boolean)
                      : [],
                  offeringConfig:
                    type === "BOWLING"
                      ? {
                          ...serializeBowlingModes(bowlingModes),
                          noShowMinutes:
                            parseInt(noShowMinutes, 10) || 30,
                        }
                      : {
                          ...(offering?.offeringConfig ?? {}),
                          noShowMinutes:
                            parseInt(noShowMinutes, 10) || 30,
                        },
                  rates:
                    type === "BOWLING"
                      ? []
                      : rates
                          .filter((r) => r.label && r.price)
                          .map((r) => ({
                            label: r.label,
                            durationMinutes: r.durationMinutes
                              ? parseInt(r.durationMinutes, 10)
                              : undefined,
                            price: parseFloat(r.price) || 0,
                          })),
                };
                })(),
                imageFile,
                      ).catch((e) => {
                setFeedback({
                  variant: "error",
                  message:
                    e instanceof Error
                      ? e.message
                      : t("gamingSetup.editor.saveFailed"),
                });
              });
            }}
          >
            {feedback ? (
              <FeedbackBanner
                variant={feedback.variant}
                message={feedback.message}
                onDismiss={() => setFeedback(null)}
              />
            ) : null}

            {isNew && !isDiningEditor ? (
              <label className="block text-xs text-zinc-500">
                {t("gamingSetup.editor.gameTypeLabel")}
                <select
                  value={type}
                  onChange={(e) => {
                    const nextType = e.target.value as ResourceType;
                    setType(nextType);
                    setBookingMode(nextType === "BOWLING" ? "TIME" : "TIME");
                    if (nextType === "BOWLING") {
                      setBowlingModeDrafts([
                        bowlingModeToDraft(
                          createBowlingMode(
                            "TIME",
                            parseInt(slotMinutes, 10) || 60,
                          ),
                        ),
                      ]);
                    }
                    if (!name.trim() || Object.values(GAMING_DEFAULT_NAMES).includes(name as never)) {
                      setName(GAMING_DEFAULT_NAMES[nextType] ?? "");
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                >
                  {FEATURED_GAME_TYPES.map((gt) => (
                    <option key={gt} value={gt}>
                      {resourceTypeLabel(t, gt)}
                    </option>
                  ))}
                </select>
              </label>
            ) : isNew && isDiningEditor ? (
              <p className="text-xs text-zinc-500">
                {resourceTypeLabel(t, "DINING")} ·{" "}
                {t("gamingSetup.editor.diningTypeHint")}
              </p>
            ) : (
              <p className="text-xs text-zinc-500">
                {resourceTypeLabel(t, offering!.type)} · {labels.plural}
              </p>
            )}

            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="grid shrink-0 grid-cols-2 gap-3">
                {([
                  {
                    slot: "1" as const,
                    label: t("gamingSetup.editor.photoLabel", { n: 1 }),
                    preview: localPreview ?? remotePreview,
                    disabled: false,
                  },
                  {
                    slot: "2" as const,
                    label: t("gamingSetup.editor.photoLabel", { n: 2 }),
                    preview: remotePreview2,
                    disabled: !offering,
                  },
                ]).map(({ slot, label, preview, disabled }) => (
                  <div key={slot}>
                    <p className="text-xs text-zinc-500">{label}</p>
                    <div className="relative mt-1 h-24 w-24 overflow-hidden rounded-lg border border-white/10 bg-zinc-900">
                      {preview ? (
                        slot === "1" && localPreview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={preview}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        ) : (
                          <MediaImage src={preview} alt="" fill />
                        )
                      ) : (
                        <div className="flex h-full items-center justify-center text-[10px] text-zinc-600">
                          {t("gamingSetup.editor.noImage")}
                        </div>
                      )}
                    </div>
                    <label
                      className={`mt-2 inline-flex items-center gap-1 text-[11px] ${
                        disabled
                          ? "cursor-not-allowed text-zinc-600"
                          : "cursor-pointer text-emerald-400"
                      }`}
                    >
                      <Upload size={12} />
                      {uploading
                        ? t("gamingSetup.editor.uploading")
                        : t("gamingSetup.editor.chooseImage")}
                      <input
                        type="file"
                        accept={RESOURCE_IMAGE_ACCEPT}
                        className="hidden"
                        disabled={disabled || uploading || saving}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void pickImage(slot, f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {disabled ? (
                      <p className="mt-1 max-w-[6.5rem] text-[9px] leading-tight text-zinc-600">
                        {t("gamingSetup.editor.secondPhotoHint")}
                      </p>
                    ) : null}
                  </div>
                ))}
                <p className="col-span-2 max-w-[13.5rem] text-[9px] leading-tight text-zinc-600">
                  {t("gamingSetup.editor.uploadHint", {
                    size: formatImageSize(RESOURCE_IMAGE_MAX_BYTES),
                  })}
                </p>
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <label className="block text-xs text-zinc-500">
                  {t("gamingSetup.editor.displayName")}
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                  />
                </label>
                {!isDiningEditor ? (
                  <label className="block text-xs text-zinc-500">
                    {t("gamingSetup.editor.totalUnits", {
                      plural: labels.plural,
                    })}
                    <input
                      type="number"
                      min={0}
                      required
                      value={totalUnits}
                      onChange={(e) => setTotalUnits(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                    />
                    <span className="mt-1 block text-[10px] text-zinc-600">
                      {t("gamingSetup.editor.stockHint", {
                        singular: labels.singular,
                      })}
                    </span>
                  </label>
                ) : (
                  <p className="text-[11px] leading-relaxed text-zinc-600">
                    {t("gamingSetup.editor.tablesAddedPrefix")}{" "}
                    <span className="text-zinc-400">
                      {t("gamingSetup.card.layoutZones")}
                    </span>{" "}
                    {t("gamingSetup.editor.tablesAddedSuffix")}
                  </p>
                )}
              </div>
            </div>

            <label className="block text-xs text-zinc-500">
              {isDiningEditor
                ? t("gamingSetup.editor.descriptionLabelDining")
                : t("gamingSetup.editor.descriptionLabelGaming")}
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder={specPlaceholder}
                className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
              />
            </label>

            {!isDiningEditor ? (
            <>
            <label className="block text-xs text-zinc-500">
              {t("gamingSetup.editor.slotMinutesLabel")}
              <input
                type="number"
                min={15}
                value={slotMinutes}
                onChange={(e) => setSlotMinutes(e.target.value)}
                className="mt-1 w-full max-w-[8rem] rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
              />
              <span className="mt-1 block text-[10px] text-zinc-600">
                {t("gamingSetup.editor.slotMinutesHint")}
              </span>
            </label>
            <label className="block text-xs text-zinc-500">
              {t("gamingSetup.editor.noShowLabel")}
              <select
                value={noShowMinutes}
                onChange={(e) => setNoShowMinutes(e.target.value)}
                className="mt-1 w-full max-w-[12rem] rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
              >
                {NO_SHOW_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {t("gamingSetup.editor.noShowOptionStart", { m })}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[10px] leading-relaxed text-zinc-600">
                {t("gamingSetup.editor.noShowHintUnit")}
              </span>
            </label>
            </>
            ) : (
              <label className="block text-xs text-zinc-500">
                {t("gamingSetup.editor.noShowLabel")}
                <select
                  value={noShowMinutes}
                  onChange={(e) => setNoShowMinutes(e.target.value)}
                  className="mt-1 w-full max-w-[12rem] rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                >
                  {NO_SHOW_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {t("gamingSetup.editor.noShowOptionArrival", { m })}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[10px] leading-relaxed text-zinc-600">
                  {t("gamingSetup.editor.noShowHintTable")}
                </span>
              </label>
            )}

            {type === "PLAYSTATION" ? (
              <label className="block text-xs text-zinc-500">
                {t("gamingSetup.editor.gamesListLabel")}
                <textarea
                  value={ps5GamesText}
                  onChange={(e) => setPs5GamesText(e.target.value)}
                  rows={4}
                  placeholder={"FC 25\nCall of Duty\nTekken 8"}
                  className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
                <span className="mt-1 block text-[10px] text-zinc-600">
                  {t("gamingSetup.editor.gamesListHint")}
                </span>
              </label>
            ) : null}

            {type === "BOWLING" ? (
              <BowlingModesEditor
                modes={bowlingModeDrafts}
                onChange={setBowlingModeDrafts}
                defaultSlotMinutes={parseInt(slotMinutes, 10) || 60}
              />
            ) : null}

            {type !== "BOWLING" && !isDiningEditor ? (
            <div>
              <p className="text-xs text-zinc-500">
                {t("gamingSetup.editor.pricingLabel")}
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-zinc-600">
                {t("gamingSetup.editor.pricingHint", {
                  min: FULL_DAY_DURATION_MINUTES,
                })}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {GAMING_PRICE_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() =>
                      setRates((prev) => [
                        ...prev,
                        {
                          label: p.label,
                          durationMinutes:
                            p.durationMinutes != null
                              ? String(p.durationMinutes)
                              : "",
                          price: "",
                        },
                      ])
                    }
                    className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-zinc-400 hover:bg-white/5"
                  >
                    + {p.label}
                  </button>
                ))}
              </div>
              <ul className="mt-2 space-y-2">
                {rates.map((r, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2">
                    <input
                      placeholder={t("gamingSetup.editor.rateLabelPlaceholder")}
                      value={r.label}
                      onChange={(e) => {
                        const next = [...rates];
                        next[i] = { ...r, label: e.target.value };
                        setRates(next);
                      }}
                      className="min-w-0 flex-1 rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-xs text-white"
                    />
                    <input
                      placeholder={t(
                        "gamingSetup.editor.rateMinutesPlaceholder",
                      )}
                      title={t("gamingSetup.editor.rateMinutesTitle")}
                      value={r.durationMinutes}
                      onChange={(e) => {
                        const next = [...rates];
                        next[i] = { ...r, durationMinutes: e.target.value };
                        setRates(next);
                      }}
                      className="w-[4.5rem] rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-xs text-white"
                    />
                    <input
                      placeholder={t("gamingSetup.editor.ratePricePlaceholder")}
                      value={r.price}
                      onChange={(e) => {
                        const next = [...rates];
                        next[i] = { ...r, price: e.target.value };
                        setRates(next);
                      }}
                      className="w-20 rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-xs text-white"
                    />
                    <button
                      type="button"
                      disabled={rates.length <= 1}
                      onClick={() => setRates(rates.filter((_, idx) => idx !== i))}
                      className="rounded p-1 text-zinc-500 hover:text-rose-300 disabled:opacity-30"
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            ) : null}

            <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
              {onDelete ? (
                <button
                  type="button"
                  onClick={() => void onDelete()}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-400/30 px-3 py-2 text-sm text-rose-300"
                >
                  <Trash2 size={14} />
                  {t("gamingSetup.editor.removeGame")}
                </button>
              ) : null}
              <button
                type="submit"
                disabled={saving || !name.trim()}
                className="ml-auto inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                {t("common.save")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
