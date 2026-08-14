"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ShopPreferences } from "./locale-currency";
import {
  fetchCurrencyRate,
  fetchShopSettings,
  updateShopSettings,
  type ShopSettings,
} from "./shop-settings-client";
import { isRtlLocale, translate, translateList, type MessageKey } from "./i18n";
import { coerceMoney, type MoneyWire } from "./money";

type VenueSettingsContextValue = {
  shop: ShopSettings | null;
  locale: string;
  currency: string;
  loading: boolean;
  /** 1 EUR = this many units of venue currency (live). */
  eurToVenueRate: number;
  refresh: () => Promise<void>;
  updatePreferences: (prefs: Partial<ShopPreferences>) => Promise<void>;
  formatMoney: (amount: MoneyWire, currencyOverride?: string) => string;
  /** Convert a catalog/plan amount stored in EUR into venue currency. */
  fromEur: (amountEur: number) => number;
  /** Format an EUR catalog price in the venue currency. */
  formatFromEur: (amountEur: number) => string;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  tList: (key: MessageKey) => string[];
};

const VenueSettingsContext = createContext<VenueSettingsContextValue | null>(
  null,
);

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

export function VenueSettingsProvider({
  initial,
  children,
}: {
  initial?: Partial<ShopSettings>;
  children: ReactNode;
}) {
  const [shop, setShop] = useState<ShopSettings | null>(
    initial ?
      {
        id: initial.id ?? "",
        name: initial.name ?? "",
        displayName: initial.displayName ?? null,
        slug: initial.slug ?? "",
        description: initial.description ?? null,
        address: initial.address ?? null,
        city: initial.city ?? null,
        country: initial.country ?? null,
        phone: initial.phone ?? null,
        email: initial.email ?? null,
        coverImage: initial.coverImage ?? null,
        locale: initial.locale ?? "en",
        timezone: initial.timezone ?? "UTC",
        currency: initial.currency ?? "EUR",
        isPublished: initial.isPublished ?? false,
        advertiseOnVenuesPage: initial.advertiseOnVenuesPage ?? true,
        reviewsMode: initial.reviewsMode ?? "ENABLED",
        floorCount: initial.floorCount ?? 1,
        version: initial.version ?? 1,
        businessDayStartMinutes: initial.businessDayStartMinutes ?? 0,
      }
    : null,
  );
  const [loading, setLoading] = useState(!initial?.locale);
  const [eurToVenueRate, setEurToVenueRate] = useState(1);

  const locale = shop?.locale ?? "en";
  const currency = shop?.currency ?? "EUR";

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = locale;
    document.documentElement.dir = isRtlLocale(locale) ? "rtl" : "ltr";
  }, [locale]);

  useEffect(() => {
    if (currency === "EUR") {
      setEurToVenueRate(1);
      return;
    }
    let cancelled = false;
    void fetchCurrencyRate("EUR", currency)
      .then((r) => {
        if (!cancelled && r.rate > 0) setEurToVenueRate(r.rate);
      })
      .catch(() => {
        if (!cancelled) setEurToVenueRate(1);
      });
    return () => {
      cancelled = true;
    };
  }, [currency]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchShopSettings();
      setShop(data.shop);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const hasFullProfile =
      !!initial?.id &&
      !!initial?.slug &&
      !!initial?.locale &&
      typeof initial.isPublished === "boolean";
    if (!hasFullProfile) {
      void refresh();
    }
  }, [initial?.id, initial?.slug, initial?.locale, initial?.isPublished, refresh]);

  const updatePreferences = useCallback(
    async (prefs: Partial<ShopPreferences>) => {
      if (!shop) throw new Error("Venue settings are not loaded.");
      const data = await updateShopSettings({
        ...prefs,
        expectedVersion: shop.version,
      });
      setShop(data.shop);
    },
    [shop],
  );

  const formatMoney = useCallback(
    (amount: MoneyWire, currencyOverride?: string) => {
      const n = coerceMoney(amount);
      try {
        return new Intl.NumberFormat(locale, {
          style: "currency",
          currency: currencyOverride ?? currency,
          maximumFractionDigits: 2,
        }).format(n);
      } catch {
        return `${n} ${currencyOverride ?? currency}`;
      }
    },
    [locale, currency],
  );

  const fromEur = useCallback(
    (amountEur: number) => roundMoney(amountEur * eurToVenueRate),
    [eurToVenueRate],
  );

  const formatFromEur = useCallback(
    (amountEur: number) => formatMoney(fromEur(amountEur)),
    [formatMoney, fromEur],
  );

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) =>
      translate(locale, key, vars),
    [locale],
  );

  const tList = useCallback(
    (key: MessageKey) => translateList(locale, key),
    [locale],
  );

  const value = useMemo(
    () => ({
      shop,
      locale,
      currency,
      loading,
      eurToVenueRate,
      refresh,
      updatePreferences,
      formatMoney,
      fromEur,
      formatFromEur,
      t,
      tList,
    }),
    [
      shop,
      locale,
      currency,
      loading,
      eurToVenueRate,
      refresh,
      updatePreferences,
      formatMoney,
      fromEur,
      formatFromEur,
      t,
      tList,
    ],
  );

  return (
    <VenueSettingsContext.Provider value={value}>
      {children}
    </VenueSettingsContext.Provider>
  );
}

export function useVenueSettings() {
  const ctx = useContext(VenueSettingsContext);
  if (!ctx) {
    throw new Error("useVenueSettings must be used inside VenueSettingsProvider");
  }
  return ctx;
}

/** Optional hook when provider not mounted */
export function useVenueSettingsOptional() {
  return useContext(VenueSettingsContext);
}
