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
  const { shop, refresh, formatMoney } = useVenueSettings();
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
      setSaveState("saving");
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
          setError(e instanceof Error ? e.message : "Could not save settings.");
          setSaveState("idle");
        });
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [draft, shop, refresh, canWrite]);

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
      setError(err instanceof Error ? err.message : "Conversion failed.");
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
        <VenueReloadOverlay message="Updating venue name across your dashboard…" />
      ) : null}

      <div className="mx-auto max-w-4xl space-y-6">
        {error ? (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-zinc-900/40 px-4 py-3">
          <p className="text-xs text-zinc-500">
            Public URL:{" "}
            <span className="text-zinc-300">/venue/{shop.slug}</span>
          </p>
          <p className="text-xs text-zinc-500">
            {saveState === "pending" && "Will save…"}
            {saveState === "saving" && "Saving…"}
            {saveState === "saved" && (
              <span className="text-emerald-400">All changes saved</span>
            )}
          </p>
        </div>

        <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-5 shadow-lg shadow-black/20">
          <div className="mb-4 flex items-center gap-2 text-emerald-300">
            <Building2 size={18} />
            <h2 className="font-semibold text-white">Venue identity</h2>
          </div>
          <p className="mb-4 text-sm text-zinc-500">
            Internal name appears in your dashboard sidebar. Display name is what
            players see on marketing and your public page.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs text-zinc-500">
              Dashboard venue name
              <input
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
                disabled={fieldDisabled}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-500">
              Marketing display name
              <input
                value={draft.displayName}
                onChange={(e) => patch({ displayName: e.target.value })}
                disabled={fieldDisabled}
                placeholder={draft.name || "Same as venue name"}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600"
              />
            </label>
          </div>
          <p className="mt-3 text-xs text-zinc-600">
            Preview:{" "}
            <span className="text-zinc-300">{marketingPreview}</span>
          </p>
          <label className="mt-4 block text-xs text-zinc-500">
            Short description
            <textarea
              value={draft.description}
              onChange={(e) => patch({ description: e.target.value })}
              disabled={fieldDisabled}
              rows={3}
              className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white"
            />
          </label>
          <label
            className={cn(
              "mt-4 flex items-center gap-2 text-sm text-zinc-400",
              marketingUnlocked ? "cursor-pointer" : "cursor-not-allowed opacity-70",
            )}
          >
            <input
              type="checkbox"
              checked={draft.isPublished}
              onChange={(e) => void onPublishToggle(e.target.checked)}
              disabled={fieldDisabled || !marketingUnlocked}
              className="rounded border-white/20"
            />
            <Megaphone size={16} className="text-violet-400" />
            Public venue page is live
          </label>
          <p className="mt-1 pl-6 text-[11px] text-zinc-600">
            {marketingUnlocked
              ? `Guests can open your page at /venue/${shop?.slug ?? "…"}. Separate from directory advertising below.`
              : "Requires the Venue page & discovery add-on to publish."}
          </p>

          <label
            className={cn(
              "mt-4 flex items-start gap-2 text-sm text-zinc-400",
              marketingUnlocked && draft.isPublished
                ? "cursor-pointer"
                : "cursor-not-allowed opacity-70",
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
            <span>
              <span className="inline-flex items-center gap-1.5 text-zinc-300">
                Show on{" "}
                <a
                  href="/venues"
                  className="text-amber-300/90 underline-offset-2 hover:underline"
                >
                  /venues
                </a>{" "}
                directory
              </span>
              <span className="mt-0.5 block text-[11px] text-zinc-600">
                {marketingUnlocked
                  ? "Even with Venue page & discovery subscribed, turn this off to stay off the browse list. Requires a live public page."
                  : "Unlock Venue page & discovery to appear in the directory."}
              </span>
            </span>
          </label>

          <div className="mt-5 border-t border-white/10 pt-4">
            <p className="text-xs font-medium text-zinc-400">Guest reviews</p>
            <p className="mt-1 text-[11px] text-zinc-600">
              Applies to venue reviews guests leave on your public page.
              Staff publish approved reviews from the Reviews dashboard.
            </p>
            <div className="mt-3 space-y-2">
              {(
                [
                  {
                    value: "ENABLED" as const,
                    label: "On — accept; staff publish",
                    hint: "Guests can leave venue reviews; ratings appear publicly after you publish them from Reviews.",
                  },
                  {
                    value: "HIDDEN" as const,
                    label: "Hidden — accept but don’t show",
                    hint: "Guests can still submit; you get notified, but ratings stay off the public page.",
                  },
                  {
                    value: "DISABLED" as const,
                    label: "Off — no reviews at all",
                    hint: "Nobody can leave reviews on this venue.",
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
            <h2 className="font-semibold text-white">Location & contact</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs text-zinc-500 sm:col-span-2">
              Street address
              <input
                value={draft.address}
                onChange={(e) => patch({ address: e.target.value })}
                disabled={fieldDisabled}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-500">
              City
              <input
                value={draft.city}
                onChange={(e) => patch({ city: e.target.value })}
                disabled={fieldDisabled}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-500">
              Country
              <input
                value={draft.country}
                onChange={(e) => patch({ country: e.target.value })}
                disabled={fieldDisabled}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-500">
              Phone
              <input
                value={draft.phone}
                onChange={(e) => patch({ phone: e.target.value })}
                disabled={fieldDisabled}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-500">
              Email
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
            <h2 className="font-semibold text-white">Regional preferences</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs text-zinc-500">
              Dashboard language
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
              Venue currency
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
            Preview: {formatMoneyAmount(49.99, draft.currency, draft.locale)}
          </p>
        </section>

        <form
          onSubmit={onConvert}
          className="rounded-2xl border border-violet-400/15 bg-violet-500/[0.04] p-5"
        >
          <div className="mb-4 flex items-center gap-2 text-violet-300">
            <ArrowRightLeft size={18} />
            <h2 className="font-semibold text-white">Currency converter</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block text-xs text-zinc-500">
              Amount
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
              From
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
                To
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
            Multiple targets
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
            Convert
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
