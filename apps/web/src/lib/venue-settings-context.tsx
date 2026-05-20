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
  fetchShopSettings,
  updateShopSettings,
  type ShopSettings,
} from "./shop-settings-client";

type VenueSettingsContextValue = {
  shop: ShopSettings | null;
  locale: string;
  currency: string;
  loading: boolean;
  refresh: () => Promise<void>;
  updatePreferences: (prefs: Partial<ShopPreferences>) => Promise<void>;
  formatMoney: (amount: number, currencyOverride?: string) => string;
};

const VenueSettingsContext = createContext<VenueSettingsContextValue | null>(
  null,
);

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
        currency: initial.currency ?? "EUR",
        isPublished: initial.isPublished ?? false,
        floorCount: initial.floorCount ?? 1,
      }
    : null,
  );
  const [loading, setLoading] = useState(!initial?.locale);

  const locale = shop?.locale ?? "en";
  const currency = shop?.currency ?? "EUR";

  useEffect(() => {
    if (initial?.locale) {
      document.documentElement.lang = initial.locale;
    }
  }, [initial?.locale]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchShopSettings();
      setShop(data.shop);
      if (typeof document !== "undefined") {
        document.documentElement.lang = data.shop.locale;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initial?.id) {
      void refresh();
    }
  }, [initial?.id, refresh]);

  const updatePreferences = useCallback(
    async (prefs: Partial<ShopPreferences>) => {
      const data = await updateShopSettings(prefs);
      setShop(data.shop);
      if (typeof document !== "undefined") {
        document.documentElement.lang = data.shop.locale;
      }
    },
    [],
  );

  const formatMoney = useCallback(
    (amount: number, currencyOverride?: string) => {
      try {
        return new Intl.NumberFormat(locale, {
          style: "currency",
          currency: currencyOverride ?? currency,
          maximumFractionDigits: 2,
        }).format(amount);
      } catch {
        return `${amount} ${currencyOverride ?? currency}`;
      }
    },
    [locale, currency],
  );

  const value = useMemo(
    () => ({
      shop,
      locale,
      currency,
      loading,
      refresh,
      updatePreferences,
      formatMoney,
    }),
    [shop, locale, currency, loading, refresh, updatePreferences, formatMoney],
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
