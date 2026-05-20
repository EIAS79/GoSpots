"use client";

import {
  ArrowRightLeft,
  Building2,
  Globe,
  Layers,
  Loader2,
  MapPin,
  Megaphone,
  Minus,
  Plus,
} from "lucide-react";
import { useEffect, useState } from "react";
import { VenueReloadOverlay } from "@/components/venue/venue-reload-overlay";
import { cn } from "@/lib/cn";
import { SUPPORTED_CURRENCIES } from "@/lib/locale-currency";
import { formatMoney as formatMoneyAmount } from "@/lib/format";
import {
  convertCurrency,
  fetchShopSettings,
  updateShopSettings,
  type ShopSettings,
} from "@/lib/shop-settings-client";
import {
  identityChanged,
  profileDraftMatches,
  profileDraftToPayload,
  shopToProfileDraft,
  type ShopProfileDraft,
} from "@/lib/shop-profile-draft";
import { venueMarketingName } from "@/lib/venue-display";
import { useVenueSettings } from "@/lib/venue-settings-context";

type SaveState = "idle" | "pending" | "saving" | "saved";

export function ShopSettingsPanel() {
  const { shop, refresh, formatMoney } = useVenueSettings();
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
    if (!shop || !draft) return;
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
  }, [draft, shop, refresh]);

  function patch(partial: Partial<ShopProfileDraft>) {
    setDraft((d) => (d ? { ...d, ...partial } : d));
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
                disabled={saveState === "saving" || reloading}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-500">
              Marketing display name
              <input
                value={draft.displayName}
                onChange={(e) => patch({ displayName: e.target.value })}
                disabled={saveState === "saving" || reloading}
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
              disabled={saveState === "saving" || reloading}
              rows={3}
              className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white"
            />
          </label>
          <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-zinc-400">
            <input
              type="checkbox"
              checked={draft.isPublished}
              onChange={(e) => patch({ isPublished: e.target.checked })}
              disabled={saveState === "saving" || reloading}
              className="rounded border-white/20"
            />
            <Megaphone size={16} className="text-violet-400" />
            Publish on marketing browse page
          </label>
        </section>

        <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-5 shadow-lg shadow-black/20">
          <div className="mb-4 flex items-center gap-2 text-violet-300">
            <Layers size={18} />
            <h2 className="font-semibold text-white">Venue layout</h2>
          </div>
          <p className="mb-4 text-sm text-zinc-500">
            How many physical floors your restaurant or lounge has. Dining seating
            in Reservations uses this to organize tables by level (default is one
            floor).
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-zinc-400">Number of floors</span>
            <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-zinc-950 p-1">
              <button
                type="button"
                disabled={
                  saveState === "saving" ||
                  reloading ||
                  draft.floorCount <= 1
                }
                onClick={() =>
                  patch({ floorCount: Math.max(1, draft.floorCount - 1) })
                }
                className="rounded p-1.5 text-zinc-400 hover:bg-white/5 disabled:opacity-30"
                aria-label="Fewer floors"
              >
                <Minus size={16} />
              </button>
              <span className="min-w-[2.5rem] text-center text-sm font-semibold text-white">
                {draft.floorCount}
              </span>
              <button
                type="button"
                disabled={
                  saveState === "saving" ||
                  reloading ||
                  draft.floorCount >= 10
                }
                onClick={() =>
                  patch({ floorCount: Math.min(10, draft.floorCount + 1) })
                }
                className="rounded p-1.5 text-zinc-400 hover:bg-white/5 disabled:opacity-30"
                aria-label="More floors"
              >
                <Plus size={16} />
              </button>
            </div>
            <span className="text-xs text-zinc-600">1–10 levels</span>
          </div>
        </section>

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
                disabled={saveState === "saving" || reloading}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-500">
              City
              <input
                value={draft.city}
                onChange={(e) => patch({ city: e.target.value })}
                disabled={saveState === "saving" || reloading}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-500">
              Country
              <input
                value={draft.country}
                onChange={(e) => patch({ country: e.target.value })}
                disabled={saveState === "saving" || reloading}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-500">
              Phone
              <input
                value={draft.phone}
                onChange={(e) => patch({ phone: e.target.value })}
                disabled={saveState === "saving" || reloading}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-500">
              Email
              <input
                type="email"
                value={draft.email}
                onChange={(e) => patch({ email: e.target.value })}
                disabled={saveState === "saving" || reloading}
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
                disabled={saveState === "saving" || reloading}
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
                disabled={saveState === "saving" || reloading}
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
          <div className="grid gap-4 sm:grid-cols-3">
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
            disabled={converting}
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
