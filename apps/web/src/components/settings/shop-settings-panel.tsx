"use client";

import {
  ArrowRightLeft,
  Building2,
  Download,
  Eraser,
  Globe,
  KeyRound,
  Loader2,
  MapPin,
  Megaphone,
  Shield,
} from "lucide-react";
import { useEffect, useState } from "react";
import { CurrencyChangeConfirmDialog } from "@/components/settings/currency-change-confirm-dialog";
import { VenueCategoriesSection } from "@/components/settings/venue-categories-section";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { VenueReloadOverlay } from "@/components/venue/venue-reload-overlay";
import { cn } from "@/lib/cn";
import { GdprOwnerExtras } from "@/components/settings/gdpr-owner-extras";
import {
  downloadGdprExportJson,
  eraseGuest,
  GDPR_ERASE_ENTITY_TYPES,
  gdprEraseErrorMessage,
  gdprExportErrorMessage,
  type GdprEraseEntityType,
} from "@/lib/gdpr-client";
import {
  isValidIanaTimeZone,
  listIanaTimeZones,
} from "@/lib/iana-timezone";
import { SUPPORTED_CURRENCIES } from "@/lib/locale-currency";
import { formatMoney as formatMoneyAmount } from "@/lib/format";
import { isFeatureUnlocked } from "@/lib/plan";
import {
  convertCurrency,
  fetchCurrencyHistory,
  fetchShopSettings,
  previewCurrencyChange,
  rotateDashboardKey,
  rotateDashboardKeyErrorMessage,
  updateShopSettings,
  type CurrencyChangePreview,
  type CurrencyHistoryItem,
} from "@/lib/shop-settings-client";
import {
  identityChanged,
  profileDraftMatches,
  profileDraftToPayload,
  shopToProfileDraft,
  type ShopProfileDraft,
} from "@/lib/shop-profile-draft";
import { useCurrentMembership } from "@/lib/use-current-membership";
import { useVenueAccess } from "@/lib/use-venue-access";
import { setStoredVenuePath } from "@/lib/venue-api-headers";
import { venueMarketingName } from "@/lib/venue-display";
import { useVenueSettings } from "@/lib/venue-settings-context";

type SaveState = "idle" | "pending" | "saving" | "saved";

function eraseEntityTypeLabel(
  t: (key: string, vars?: Record<string, string | number>) => string,
  entityType: GdprEraseEntityType,
): string {
  switch (entityType) {
    case "reservation":
      return t("settings.eraseEntityReservation");
    case "eventRequest":
      return t("settings.eraseEntityEventRequest");
    case "guestChat":
      return t("settings.eraseEntityGuestChat");
    case "contactMessage":
      return t("settings.eraseEntityContactMessage");
    case "venueReview":
      return t("settings.eraseEntityVenueReview");
  }
}

export function ShopSettingsPanel({ canWrite = true }: { canWrite?: boolean }) {
  const { shop, refresh, formatMoney, t, locale } = useVenueSettings();
  const access = useVenueAccess();
  const membership = useCurrentMembership();
  const isOwner = membership?.role === "OWNER";
  const marketingUnlocked = isFeatureUnlocked(
    access.enabledModules,
    "marketing",
  );
  const [draft, setDraft] = useState<ShopProfileDraft | null>(null);
  const [locales, setLocales] = useState<{ code: string; label: string }[]>([]);
  const [currencies, setCurrencies] = useState<
    { code: string; label: string; symbol?: string }[]
  >([...SUPPORTED_CURRENCIES]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [eraseEntityType, setEraseEntityType] =
    useState<GdprEraseEntityType>("reservation");
  const [eraseEntityId, setEraseEntityId] = useState("");
  const [erasePassword, setErasePassword] = useState("");
  const [eraseConfirmOpen, setEraseConfirmOpen] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [eraseNote, setEraseNote] = useState<string | null>(null);
  const [eraseError, setEraseError] = useState<string | null>(null);

  const [rotatePassword, setRotatePassword] = useState("");
  const [rotateConfirmOpen, setRotateConfirmOpen] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotateNote, setRotateNote] = useState<string | null>(null);
  const [rotateError, setRotateError] = useState<string | null>(null);

  const [convertAmount, setConvertAmount] = useState("100");
  const [convertFrom, setConvertFrom] = useState("EUR");
  const [convertTo, setConvertTo] = useState("USD");
  const [multiTargets, setMultiTargets] = useState(false);
  const [extraTargets, setExtraTargets] = useState<string[]>(["USD", "PLN"]);
  const [convertResult, setConvertResult] = useState<Awaited<
    ReturnType<typeof convertCurrency>
  > | null>(null);
  const [converting, setConverting] = useState(false);
  const [catalogFxNote, setCatalogFxNote] = useState<string | null>(null);
  const [timezones] = useState(() => listIanaTimeZones());
  const [currencyPreview, setCurrencyPreview] =
    useState<CurrencyChangePreview | null>(null);
  const [currencyPreviewLoading, setCurrencyPreviewLoading] = useState(false);
  const [currencyApplying, setCurrencyApplying] = useState(false);
  const [currencyHistory, setCurrencyHistory] = useState<
    CurrencyHistoryItem[] | null
  >(null);
  const [currencyHistoryError, setCurrencyHistoryError] = useState<
    string | null
  >(null);
  const [currencyHistoryLoading, setCurrencyHistoryLoading] = useState(false);

  const reloadCurrencyHistory = () => {
    setCurrencyHistoryLoading(true);
    setCurrencyHistoryError(null);
    fetchCurrencyHistory(20)
      .then((d) => setCurrencyHistory(d.items))
      .catch(() => {
        setCurrencyHistory(null);
        setCurrencyHistoryError(t("settings.currencyHistoryLoadError"));
      })
      .finally(() => setCurrencyHistoryLoading(false));
  };

  useEffect(() => {
    if (!shop) return;
    setDraft(shopToProfileDraft(shop));
    setConvertFrom(shop.currency);
    setCurrencyPreview(null);
    setCurrencyPreviewLoading(false);
    setCurrencyApplying(false);
    setSaveState("idle");
  }, [shop]);

  useEffect(() => {
    if (!shop) return;
    reloadCurrencyHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per shop bind
  }, [shop?.id]);

  useEffect(() => {
    fetchShopSettings()
      .then((d) => {
        setLocales(d.locales);
        setCurrencies(d.currencies);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!canWrite || !shop || !draft) return;
    if (profileDraftMatches(shop, draft)) {
      setSaveState((s) => (s === "pending" ? "idle" : s));
      return;
    }

    // Currency apply only via preview → confirm modal (needs confirm:true).
    if (draft.currency !== shop.currency) {
      setSaveState(
        currencyPreview || currencyPreviewLoading ? "pending" : "idle",
      );
      return;
    }

    setSaveState("pending");
    const timer = window.setTimeout(() => {
      if (!isValidIanaTimeZone(draft.timezone)) {
        setError(t("settings.timezoneInvalid"));
        setSaveState("idle");
        return;
      }

      setSaveState("saving");
      setError(null);
      const before = shop;
      void updateShopSettings(profileDraftToPayload(draft))
        .then((data) => {
          const after = data.shop;
          if (identityChanged(before, after)) {
            setReloading(true);
            window.setTimeout(() => window.location.reload(), 400);
            return;
          }
          void refresh();
          setSaveState("saved");
          window.setTimeout(() => {
            setSaveState((s) => (s === "saved" ? "idle" : s));
          }, 2000);
        })
        .catch((e) => {
          setError(
            e instanceof Error ? e.message : t("settings.saveFailed"),
          );
          setSaveState("idle");
        });
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [
    draft,
    shop,
    refresh,
    canWrite,
    t,
    currencyPreview,
    currencyPreviewLoading,
  ]);

  function patch(partial: Partial<ShopProfileDraft>) {
    setDraft((d) => (d ? { ...d, ...partial } : d));
  }

  async function onCurrencySelect(next: string) {
    if (!canWrite || !shop || !draft || currencyApplying) return;
    patch({ currency: next });
    setCurrencyPreview(null);
    setCatalogFxNote(null);
    if (next === shop.currency) {
      setCurrencyPreviewLoading(false);
      return;
    }
    setCurrencyPreviewLoading(true);
    setError(null);
    setSaveState("pending");
    try {
      const preview = await previewCurrencyChange(next);
      setCurrencyPreview(preview);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("settings.conversionFailed"),
      );
      setDraft((d) => (d ? { ...d, currency: shop.currency } : d));
      setCurrencyPreview(null);
      setSaveState("idle");
    } finally {
      setCurrencyPreviewLoading(false);
    }
  }

  function onCancelCurrencyChange() {
    if (currencyApplying || !shop) return;
    setCurrencyPreview(null);
    setDraft((d) => (d ? { ...d, currency: shop.currency } : d));
    setSaveState("idle");
  }

  async function onConfirmCurrencyChange() {
    if (!canWrite || !shop || !draft || !currencyPreview || currencyApplying) {
      return;
    }
    setCurrencyApplying(true);
    setSaveState("saving");
    setError(null);
    const before = shop;
    try {
      const data = await updateShopSettings({
        ...profileDraftToPayload(draft),
        confirm: true,
      });
      setCurrencyPreview(null);
      const after = data.shop;
      if (data.currencyConversion) {
        const c = data.currencyConversion;
        setCatalogFxNote(
          t("settings.catalogConverted", {
            from: c.from,
            to: c.to,
            rate: c.rate.toFixed(4),
            menu: c.menuItems,
            rates: c.resourceRates,
            when: new Date(c.ratesAt).toLocaleString(locale),
          }),
        );
      }
      if (identityChanged(before, after)) {
        setReloading(true);
        window.setTimeout(() => window.location.reload(), 400);
        return;
      }
      void refresh();
      reloadCurrencyHistory();
      setSaveState("saved");
      window.setTimeout(() => {
        setSaveState((s) => (s === "saved" ? "idle" : s));
      }, 2000);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("settings.saveFailed"),
      );
      setDraft((d) => (d ? { ...d, currency: shop.currency } : d));
      setCurrencyPreview(null);
      setSaveState("idle");
    } finally {
      setCurrencyApplying(false);
    }
  }

  async function onPublishToggle(isPublished: boolean) {
    if (!canWrite || !shop || !draft) return;
    if (isPublished && !marketingUnlocked) {
      setError(t("settings.publishNeedMarketing"));
      return;
    }
    patch({ isPublished });
    setSaveState("saving");
    setError(null);
    try {
      await updateShopSettings({ isPublished });
      await refresh();
      setSaveState("saved");
      window.setTimeout(() => {
        setSaveState((s) => (s === "saved" ? "idle" : s));
      }, 2000);
    } catch (e) {
      patch({ isPublished: shop.isPublished });
      setError(
        e instanceof Error ? e.message : t("settings.visibilityUpdateFailed"),
      );
      setSaveState("idle");
    }
  }

  async function onAdvertiseToggle(advertiseOnVenuesPage: boolean) {
    if (!canWrite || !shop) return;
    if (advertiseOnVenuesPage && !marketingUnlocked) {
      setError(t("settings.advertiseNeedMarketing"));
      return;
    }
    setSaveState("saving");
    setError(null);
    try {
      await updateShopSettings({ advertiseOnVenuesPage });
      await refresh();
      setSaveState("saved");
      window.setTimeout(() => {
        setSaveState((s) => (s === "saved" ? "idle" : s));
      }, 2000);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("settings.directoryUpdateFailed"),
      );
      setSaveState("idle");
    }
  }

  async function onReviewsMode(
    reviewsMode: "ENABLED" | "DISABLED" | "HIDDEN",
  ) {
    if (!canWrite || !shop) return;
    setSaveState("saving");
    setError(null);
    try {
      await updateShopSettings({ reviewsMode });
      await refresh();
      setSaveState("saved");
      window.setTimeout(() => {
        setSaveState((s) => (s === "saved" ? "idle" : s));
      }, 2000);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("settings.reviewsUpdateFailed"),
      );
      setSaveState("idle");
    }
  }

  async function onConvert(e: React.FormEvent) {
    e.preventDefault();
    setConverting(true);
    setError(null);
    try {
      const amount = parseFloat(convertAmount);
      if (!Number.isFinite(amount) || amount < 0) {
        setError(t("settings.invalidAmount"));
        return;
      }
      const result = await convertCurrency({
        amount,
        from: convertFrom,
        to: multiTargets ? undefined : convertTo,
        toCurrencies: multiTargets ? extraTargets : undefined,
      });
      setConvertResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("settings.conversionFailed"));
    } finally {
      setConverting(false);
    }
  }

  async function onDownloadExport() {
    if (!isOwner || exporting) return;
    setExporting(true);
    setError(null);
    try {
      await downloadGdprExportJson();
    } catch (err) {
      setError(gdprExportErrorMessage(err) || t("settings.exportFailed"));
    } finally {
      setExporting(false);
    }
  }

  function onRequestErase() {
    if (!isOwner || erasing) return;
    const id = eraseEntityId.trim();
    if (!id) {
      setEraseError(t("settings.eraseNeedId"));
      setEraseNote(null);
      return;
    }
    if (!erasePassword) {
      setEraseError(t("settings.eraseNeedPassword"));
      setEraseNote(null);
      return;
    }
    setEraseError(null);
    setEraseConfirmOpen(true);
  }

  function onRequestRotateKey() {
    setRotateError(null);
    setRotateNote(null);
    if (!rotatePassword) {
      setRotateError(t("settings.dashboardKeyNeedPassword"));
      return;
    }
    setRotateConfirmOpen(true);
  }

  async function onConfirmRotateKey() {
    if (!rotatePassword) {
      setRotateError(t("settings.dashboardKeyNeedPassword"));
      setRotateConfirmOpen(false);
      return;
    }
    setRotating(true);
    setRotateError(null);
    setRotateNote(null);
    try {
      const result = await rotateDashboardKey({ password: rotatePassword });
      setStoredVenuePath(result.slug);
      setRotateNote(t("settings.dashboardKeySuccess"));
      setRotatePassword("");
      setRotateConfirmOpen(false);
    } catch (err) {
      setRotateError(
        rotateDashboardKeyErrorMessage(err) || t("settings.dashboardKeyFailed"),
      );
      setRotateConfirmOpen(false);
    } finally {
      setRotating(false);
    }
  }

  async function onConfirmErase() {
    if (!isOwner || erasing) return;
    const id = eraseEntityId.trim();
    if (!id) {
      setEraseError(t("settings.eraseNeedId"));
      setEraseConfirmOpen(false);
      return;
    }
    if (!erasePassword) {
      setEraseError(t("settings.eraseNeedPassword"));
      setEraseConfirmOpen(false);
      return;
    }
    setErasing(true);
    setEraseError(null);
    setEraseNote(null);
    try {
      const result = await eraseGuest({
        entityType: eraseEntityType,
        entityId: id,
        password: erasePassword,
      });
      setEraseNote(
        t("settings.eraseSuccess", {
          entityType: eraseEntityTypeLabel(t, result.entityType),
          entityId: result.entityId,
        }),
      );
      setEraseEntityId("");
      setErasePassword("");
      setEraseConfirmOpen(false);
    } catch (err) {
      setEraseError(gdprEraseErrorMessage(err) || t("settings.eraseFailed"));
      setEraseConfirmOpen(false);
    } finally {
      setErasing(false);
    }
  }

  if (!shop || !draft) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  const readOnly = !canWrite;
  const fieldDisabled = readOnly || saveState === "saving" || reloading;

  const marketingPreview = venueMarketingName({
    name: draft.name,
    displayName: draft.displayName,
  });

  return (
    <>
      {reloading ? (
        <VenueReloadOverlay message={t("settings.reloadOverlay")} />
      ) : null}

      <div className="mx-auto max-w-4xl space-y-6">
        {error ? (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-zinc-900/40 px-4 py-3">
          <p className="text-xs text-zinc-500">
            {t("settings.publicUrl")}{" "}
            <span className="text-zinc-300">/venue/{shop.slug}</span>
          </p>
          <p className="text-xs text-zinc-500">
            {saveState === "pending" && t("common.willSave")}
            {saveState === "saving" && t("common.saving")}
            {saveState === "saved" && (
              <span className="text-emerald-400">{t("common.allSaved")}</span>
            )}
          </p>
        </div>

        <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-5 shadow-lg shadow-black/20">
          <div className="mb-4 flex items-center gap-2 text-emerald-300">
            <Building2 size={18} />
            <h2 className="font-semibold text-white">{t("settings.identity")}</h2>
          </div>
          <p className="mb-4 text-sm text-zinc-500">
            {t("settings.identityHint")}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs text-zinc-500">
              {t("settings.dashboardName")}
              <input
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
                disabled={fieldDisabled}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-500">
              {t("settings.marketingName")}
              <input
                value={draft.displayName}
                onChange={(e) => patch({ displayName: e.target.value })}
                disabled={fieldDisabled}
                placeholder={draft.name || t("settings.marketingPlaceholder")}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600"
              />
            </label>
          </div>
          <p className="mt-3 text-xs text-zinc-600">
            {t("common.preview")}:{" "}
            <span className="text-zinc-300">{marketingPreview}</span>
          </p>
          <label className="mt-4 block text-xs text-zinc-500">
            {t("settings.shortDescription")}
            <textarea
              value={draft.description}
              onChange={(e) => patch({ description: e.target.value })}
              disabled={fieldDisabled}
              rows={3}
              className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white"
            />
          </label>
          <div className="mt-4 space-y-3 rounded-xl border border-white/10 bg-zinc-950/50 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              {t("settings.visibility")}
            </p>
            <label
              className={cn(
                "flex items-start gap-2.5 text-sm",
                marketingUnlocked
                  ? "cursor-pointer text-zinc-300"
                  : "cursor-not-allowed text-zinc-500 opacity-70",
              )}
            >
              <input
                type="checkbox"
                checked={draft.isPublished}
                onChange={(e) => void onPublishToggle(e.target.checked)}
                disabled={fieldDisabled || !marketingUnlocked}
                className="mt-0.5 rounded border-white/20"
              />
              <span className="min-w-0">
                <span className="inline-flex items-center gap-1.5 font-medium text-zinc-200">
                  <Megaphone size={15} className="shrink-0 text-violet-400" />
                  {t("settings.publishPage")}
                </span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-zinc-600">
                  {marketingUnlocked
                    ? t("settings.publishPageHint", {
                        slug: shop?.slug ?? "…",
                      })
                    : t("settings.publishLocked")}
                </span>
              </span>
            </label>

            <div className="border-t border-white/5" />

            <label
              className={cn(
                "flex items-start gap-2.5 text-sm",
                marketingUnlocked && draft.isPublished
                  ? "cursor-pointer text-zinc-300"
                  : "cursor-not-allowed text-zinc-500 opacity-70",
              )}
            >
              <input
                type="checkbox"
                checked={shop?.advertiseOnVenuesPage ?? true}
                onChange={(e) => void onAdvertiseToggle(e.target.checked)}
                disabled={
                  fieldDisabled || !draft.isPublished || !marketingUnlocked
                }
                className="mt-0.5 rounded border-white/20"
              />
              <span className="min-w-0">
                <span className="font-medium text-zinc-200">
                  {t("settings.listDirectory")}
                </span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-zinc-600">
                  {marketingUnlocked
                    ? t("settings.listDirectoryHint")
                    : t("settings.listLocked")}
                </span>
              </span>
            </label>
          </div>

          <div className="mt-5 border-t border-white/10 pt-4">
            <p className="text-xs font-medium text-zinc-400">
              {t("settings.reviewsTitle")}
            </p>
            <p className="mt-1 text-[11px] text-zinc-600">
              {t("settings.reviewsHint")}
            </p>
            <div className="mt-3 space-y-2">
              {(
                [
                  {
                    value: "ENABLED" as const,
                    label: t("settings.reviewsOn"),
                    hint: t("settings.reviewsOnHint"),
                  },
                  {
                    value: "HIDDEN" as const,
                    label: t("settings.reviewsHidden"),
                    hint: t("settings.reviewsHiddenHint"),
                  },
                  {
                    value: "DISABLED" as const,
                    label: t("settings.reviewsOff"),
                    hint: t("settings.reviewsOffHint"),
                  },
                ] as const
              ).map((opt) => {
                const active = (shop?.reviewsMode ?? "ENABLED") === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={cn(
                      "flex cursor-pointer gap-2 rounded-lg border px-3 py-2.5 text-sm transition",
                      active
                        ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-100"
                        : "border-white/10 text-zinc-400 hover:bg-white/[0.03]",
                      fieldDisabled && "pointer-events-none opacity-50",
                    )}
                  >
                    <input
                      type="radio"
                      name="reviewsMode"
                      className="mt-1"
                      checked={active}
                      disabled={fieldDisabled}
                      onChange={() => void onReviewsMode(opt.value)}
                    />
                    <span>
                      <span className="font-medium text-zinc-200">
                        {opt.label}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-zinc-600">
                        {opt.hint}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </section>

        <VenueCategoriesSection canWrite={canWrite} />

        <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-5">
          <div className="mb-4 flex items-center gap-2 text-sky-300">
            <MapPin size={18} />
            <h2 className="font-semibold text-white">{t("settings.location")}</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs text-zinc-500 sm:col-span-2">
              {t("settings.street")}
              <input
                value={draft.address}
                onChange={(e) => patch({ address: e.target.value })}
                disabled={fieldDisabled}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-500">
              {t("settings.city")}
              <input
                value={draft.city}
                onChange={(e) => patch({ city: e.target.value })}
                disabled={fieldDisabled}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-500">
              {t("settings.country")}
              <input
                value={draft.country}
                onChange={(e) => patch({ country: e.target.value })}
                disabled={fieldDisabled}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-500">
              {t("common.phone")}
              <input
                value={draft.phone}
                onChange={(e) => patch({ phone: e.target.value })}
                disabled={fieldDisabled}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-500">
              {t("common.email")}
              <input
                type="email"
                value={draft.email}
                onChange={(e) => patch({ email: e.target.value })}
                disabled={fieldDisabled}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white"
              />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-5">
          <div className="mb-4 flex items-center gap-2 text-emerald-300">
            <Globe size={18} />
            <h2 className="font-semibold text-white">{t("settings.regional")}</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs text-zinc-500">
              {t("settings.language")}
              <select
                value={draft.locale}
                onChange={(e) => patch({ locale: e.target.value })}
                disabled={fieldDisabled}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white"
              >
                {locales.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-zinc-500">
              {t("settings.timezone")}
              <select
                value={
                  timezones.includes(draft.timezone)
                    ? draft.timezone
                    : draft.timezone || "UTC"
                }
                onChange={(e) => {
                  setError(null);
                  patch({ timezone: e.target.value });
                }}
                disabled={fieldDisabled}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white"
              >
                {!timezones.includes(draft.timezone) && draft.timezone ? (
                  <option value={draft.timezone}>{draft.timezone}</option>
                ) : null}
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-zinc-500">
              {t("settings.currency")}
              <select
                value={draft.currency}
                onChange={(e) => void onCurrencySelect(e.target.value)}
                disabled={
                  fieldDisabled || currencyPreviewLoading || currencyApplying
                }
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white"
              >
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            {currencyPreviewLoading ? (
              <p className="flex items-center gap-2 text-xs text-zinc-500 sm:col-span-2 lg:col-span-1 lg:pt-6">
                <Loader2 size={14} className="animate-spin" />
                {t("settings.currencyConfirmPreviewing")}
              </p>
            ) : null}
          </div>
          <p className="mt-3 text-xs text-zinc-600">
            {t("settings.timezoneHint")}
          </p>
          <p className="mt-3 text-xs text-zinc-600">
            {t("settings.currencyHint", {
              currency: draft.currency,
              preview: formatMoneyAmount(49.99, draft.currency, draft.locale),
            })}
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            {t("settings.currencyConvertHint")}
          </p>
          {catalogFxNote ? (
            <p className="mt-2 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-200">
              {catalogFxNote}
            </p>
          ) : null}
          <div className="mt-4 rounded-xl border border-white/10 bg-zinc-950/40 p-4">
            <h3 className="text-sm font-medium text-white">
              {t("settings.currencyHistoryTitle")}
            </h3>
            <p className="mt-1 text-xs text-zinc-600">
              {t("settings.currencyHistoryHint")}
            </p>
            {currencyHistoryLoading ? (
              <p className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
                <Loader2 size={14} className="animate-spin" />
                {t("common.loading")}
              </p>
            ) : currencyHistoryError ? (
              <p className="mt-3 text-xs text-amber-300/90">
                {currencyHistoryError}
              </p>
            ) : !currencyHistory?.length ? (
              <p className="mt-3 text-xs text-zinc-600">
                {t("settings.currencyHistoryEmpty")}
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {currencyHistory.map((row) => (
                  <li
                    key={row.id}
                    className="rounded-lg border border-white/5 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-300"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium text-white">
                        {row.from} → {row.to}
                      </span>
                      <time
                        className="text-zinc-500"
                        dateTime={row.createdAt}
                      >
                        {new Date(row.createdAt).toLocaleString(locale)}
                      </time>
                    </div>
                    {row.rate != null ? (
                      <p className="mt-1 text-zinc-500">
                        {t("settings.currencyHistoryRate", {
                          rate: row.rate.toFixed(6),
                        })}
                      </p>
                    ) : null}
                    {row.menuItems != null ||
                    row.resourceRates != null ||
                    row.resources != null ||
                    row.offerings != null ? (
                      <p className="mt-0.5 text-zinc-600">
                        {t("settings.currencyHistoryCatalog", {
                          menu: row.menuItems ?? 0,
                          rates: row.resourceRates ?? 0,
                          resources: row.resources ?? 0,
                          offerings: row.offerings ?? 0,
                        })}
                      </p>
                    ) : null}
                    {row.actorName || row.actorEmail ? (
                      <p className="mt-0.5 text-zinc-600">
                        {t("settings.currencyHistoryBy", {
                          name: row.actorName || row.actorEmail || "",
                        })}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <form
          onSubmit={onConvert}
          className="rounded-2xl border border-violet-400/15 bg-violet-500/[0.04] p-5"
        >
          <div className="mb-4 flex items-center gap-2 text-violet-300">
            <ArrowRightLeft size={18} />
            <h2 className="font-semibold text-white">{t("settings.converter")}</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block text-xs text-zinc-500">
              {t("common.amount")}
              <input
                type="number"
                min={0}
                step="0.01"
                value={convertAmount}
                onChange={(e) => setConvertAmount(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-500">
              {t("common.from")}
              <select
                value={convertFrom}
                onChange={(e) => setConvertFrom(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
              >
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </select>
            </label>
            {!multiTargets ? (
              <label className="block text-xs text-zinc-500">
                {t("common.to")}
                <select
                  value={convertTo}
                  onChange={(e) => setConvertTo(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
                >
                  {currencies.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm text-zinc-400">
            <input
              type="checkbox"
              checked={multiTargets}
              onChange={(e) => setMultiTargets(e.target.checked)}
            />
            {t("settings.multiTargets")}
          </label>
          {multiTargets ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {currencies
                .filter((c) => c.code !== convertFrom)
                .map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() =>
                      setExtraTargets((prev) =>
                        prev.includes(c.code)
                          ? prev.filter((x) => x !== c.code)
                          : [...prev, c.code],
                      )
                    }
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs",
                      extraTargets.includes(c.code)
                        ? "border-violet-400/40 bg-violet-500/20 text-violet-200"
                        : "border-white/10 text-zinc-500",
                    )}
                  >
                    {c.code}
                  </button>
                ))}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={converting || readOnly}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-violet-400/30 bg-violet-500/15 px-4 py-2 text-sm text-violet-200 disabled:opacity-50"
          >
            {converting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <ArrowRightLeft size={16} />
            )}
            {t("common.convert")}
          </button>
          {convertResult ? (
            <ul className="mt-4 space-y-1 text-sm">
              {convertResult.conversions.map((row) => (
                <li key={row.currency} className="flex justify-between">
                  <span className="text-zinc-500">{row.currency}</span>
                  <span>{formatMoney(row.amount, row.currency)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </form>

        {isOwner ? (
          <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-5">
            <div className="mb-4 flex items-center gap-2 text-emerald-300">
              <Shield size={18} />
              <h2 className="font-semibold text-white">{t("settings.privacy")}</h2>
            </div>
            <p className="mb-4 text-sm text-zinc-500">
              {t("settings.privacyHint")}
            </p>
            <button
              type="button"
              onClick={() => void onDownloadExport()}
              disabled={exporting}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-950 px-4 py-2 text-sm text-zinc-200 hover:border-white/20 disabled:opacity-50"
            >
              {exporting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Download size={16} />
              )}
              {t("settings.downloadExport")}
            </button>

            <div className="mt-6 border-t border-white/10 pt-5">
              <div className="mb-2 flex items-center gap-2 text-amber-200/90">
                <KeyRound size={16} />
                <h3 className="text-sm font-semibold text-zinc-100">
                  {t("settings.dashboardKey")}
                </h3>
              </div>
              <p className="mb-4 text-sm text-zinc-500">
                {t("settings.dashboardKeyHint")}
              </p>
              {rotateError ? (
                <p className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                  {rotateError}
                </p>
              ) : null}
              {rotateNote ? (
                <p className="mb-3 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-200">
                  {rotateNote}
                </p>
              ) : null}
              <form
                className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
                onSubmit={(e) => {
                  e.preventDefault();
                  onRequestRotateKey();
                }}
              >
                <label className="block min-w-[12rem] flex-[2] text-xs text-zinc-500">
                  {t("settings.dashboardKeyPassword")}
                  <input
                    type="password"
                    value={rotatePassword}
                    onChange={(e) => setRotatePassword(e.target.value)}
                    placeholder={t("settings.dashboardKeyPasswordPlaceholder")}
                    disabled={rotating}
                    autoComplete="current-password"
                    className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 disabled:opacity-50"
                  />
                </label>
                <button
                  type="submit"
                  disabled={rotating}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-100 hover:bg-amber-500/20 disabled:opacity-50"
                >
                  {rotating ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <KeyRound size={16} />
                  )}
                  {t("settings.dashboardKeyRotate")}
                </button>
              </form>
            </div>

            <div className="mt-6 border-t border-white/10 pt-5">
              <div className="mb-2 flex items-center gap-2 text-rose-200/90">
                <Eraser size={16} />
                <h3 className="text-sm font-semibold text-zinc-100">
                  {t("settings.eraseGuest")}
                </h3>
              </div>
              <p className="mb-4 text-sm text-zinc-500">
                {t("settings.eraseGuestHint")}
              </p>
              {eraseError ? (
                <p className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                  {eraseError}
                </p>
              ) : null}
              {eraseNote ? (
                <p className="mb-3 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-200">
                  {eraseNote}
                </p>
              ) : null}
              <form
                className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
                onSubmit={(e) => {
                  e.preventDefault();
                  onRequestErase();
                }}
              >
                <label className="block min-w-[10rem] flex-1 text-xs text-zinc-500">
                  {t("settings.eraseEntityType")}
                  <select
                    value={eraseEntityType}
                    onChange={(e) =>
                      setEraseEntityType(e.target.value as GdprEraseEntityType)
                    }
                    disabled={erasing}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 disabled:opacity-50"
                  >
                    {GDPR_ERASE_ENTITY_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {eraseEntityTypeLabel(t, type)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block min-w-[12rem] flex-[2] text-xs text-zinc-500">
                  {t("settings.eraseEntityId")}
                  <input
                    type="text"
                    value={eraseEntityId}
                    onChange={(e) => setEraseEntityId(e.target.value)}
                    placeholder={t("settings.eraseEntityIdPlaceholder")}
                    disabled={erasing}
                    autoComplete="off"
                    className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 disabled:opacity-50"
                  />
                </label>
                <label className="block min-w-[12rem] flex-[2] text-xs text-zinc-500">
                  {t("settings.erasePassword")}
                  <input
                    type="password"
                    value={erasePassword}
                    onChange={(e) => setErasePassword(e.target.value)}
                    placeholder={t("settings.erasePasswordPlaceholder")}
                    disabled={erasing}
                    autoComplete="current-password"
                    className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 disabled:opacity-50"
                  />
                </label>
                <button
                  type="submit"
                  disabled={erasing}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
                >
                  {erasing ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Eraser size={16} />
                  )}
                  {t("settings.eraseConfirm")}
                </button>
              </form>
            </div>

            <GdprOwnerExtras
              t={t}
              erasePassword={erasePassword}
              onNeedPassword={() =>
                setEraseError(t("settings.eraseNeedPassword"))
              }
            />
          </section>
        ) : null}
      </div>

      <ConfirmDialog
        open={eraseConfirmOpen}
        title={t("settings.eraseConfirmTitle")}
        description={t("settings.eraseConfirmDesc")}
        confirmLabel={t("settings.eraseConfirm")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        busy={erasing}
        onConfirm={() => void onConfirmErase()}
        onCancel={() => !erasing && setEraseConfirmOpen(false)}
      />

      <ConfirmDialog
        open={rotateConfirmOpen}
        title={t("settings.dashboardKeyConfirmTitle")}
        description={t("settings.dashboardKeyConfirmDesc")}
        confirmLabel={t("settings.dashboardKeyRotate")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        busy={rotating}
        onConfirm={() => void onConfirmRotateKey()}
        onCancel={() => !rotating && setRotateConfirmOpen(false)}
      />

      <CurrencyChangeConfirmDialog
        open={currencyPreview != null}
        preview={currencyPreview}
        locale={locale}
        busy={currencyApplying}
        t={t}
        onConfirm={() => void onConfirmCurrencyChange()}
        onCancel={onCancelCurrencyChange}
      />
    </>
  );
}
