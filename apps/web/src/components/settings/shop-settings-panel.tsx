"use client";

import {
  ArrowRightLeft,
  Building2,
  Globe,
  Loader2,
  MapPin,
  Megaphone,
} from "lucide-react";
import { useEffect, useState } from "react";
import { VenueCategoriesSection } from "@/components/settings/venue-categories-section";
import { VenueReloadOverlay } from "@/components/venue/venue-reload-overlay";
import { cn } from "@/lib/cn";
import { SUPPORTED_CURRENCIES } from "@/lib/locale-currency";
import { formatMoney as formatMoneyAmount } from "@/lib/format";
import { isFeatureUnlocked } from "@/lib/plan";
import {
  convertCurrency,
  fetchShopSettings,
  updateShopSettings,
} from "@/lib/shop-settings-client";
import {
  identityChanged,
  profileDraftMatches,
  profileDraftToPayload,
  shopToProfileDraft,
  type ShopProfileDraft,
} from "@/lib/shop-profile-draft";
import { useVenueAccess } from "@/lib/use-venue-access";
import { venueMarketingName } from "@/lib/venue-display";
import { useVenueSettings } from "@/lib/venue-settings-context";

type SaveState = "idle" | "pending" | "saving" | "saved";

export function ShopSettingsPanel({ canWrite = true }: { canWrite?: boolean }) {
  const { shop, refresh, formatMoney, t, locale } = useVenueSettings();
  const access = useVenueAccess();
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

  useEffect(() => {
    if (!shop) return;
    setDraft(shopToProfileDraft(shop));
    setConvertFrom(shop.currency);
    setSaveState("idle");
  }, [shop]);

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

    setSaveState("pending");
    const timer = window.setTimeout(() => {
      const currencyChanging = draft.currency !== shop.currency;
      if (currencyChanging) {
        const ok = window.confirm(
          t("settings.currencyConfirm", {
            from: shop.currency,
            to: draft.currency,
          }),
        );
        if (!ok) {
          setDraft((d) => (d ? { ...d, currency: shop.currency } : d));
          setSaveState("idle");
          return;
        }
      }

      setSaveState("saving");
      const before = shop;
      void updateShopSettings(profileDraftToPayload(draft))
        .then((data) => {
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
          setSaveState("saved");
          window.setTimeout(() => {
            setSaveState((s) => (s === "saved" ? "idle" : s));
          }, 2000);
        })
        .catch((e) => {
          setError(e instanceof Error ? e.message : "Could not save settings.");
          setSaveState("idle");
        });
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [draft, shop, refresh, canWrite, t, locale]);

  function patch(partial: Partial<ShopProfileDraft>) {
    setDraft((d) => (d ? { ...d, ...partial } : d));
  }

  async function onPublishToggle(isPublished: boolean) {
    if (!canWrite || !shop || !draft) return;
    if (isPublished && !marketingUnlocked) {
      setError(
        "Unlock Venue page & discovery to publish your public venue page.",
      );
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
      setError(e instanceof Error ? e.message : "Could not update visibility.");
      setSaveState("idle");
    }
  }

  async function onAdvertiseToggle(advertiseOnVenuesPage: boolean) {
    if (!canWrite || !shop) return;
    if (advertiseOnVenuesPage && !marketingUnlocked) {
      setError(
        "Unlock Venue page & discovery to list your venue on /venues.",
      );
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
        e instanceof Error ? e.message : "Could not update directory listing.",
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
      setError(e instanceof Error ? e.message : "Could not update reviews.");
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
        setError("Enter a valid amount.");
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
              {t("settings.currency")}
              <select
                value={draft.currency}
                onChange={(e) => patch({ currency: e.target.value })}
                disabled={fieldDisabled}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white"
              >
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
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
      </div>
    </>
  );
}
