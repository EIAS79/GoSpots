/** Calendar day key in venue locale (YYYY-MM-DD). */
export function venueDayKey(locale: string, at = new Date()): string {
  return at.toLocaleDateString('en-CA', { timeZone: localeToTz(locale) });
}

function localeToTz(locale: string): string {
  const map: Record<string, string> = {
    en: 'UTC',
    'en-US': 'America/New_York',
    'en-GB': 'Europe/London',
    ar: 'Africa/Cairo',
    'ar-EG': 'Africa/Cairo',
    de: 'Europe/Berlin',
    fr: 'Europe/Paris',
  };
  return map[locale] ?? 'UTC';
}

export type MenuItemStockFields = {
  id: string;
  stock: number;
  stockDaily: number;
  stockResetOn: string | null;
  trackStock: boolean;
};

/** Reset tracked stock to daily baseline when the venue day rolls over. */
export function applyDailyStockReset<T extends MenuItemStockFields>(
  item: T,
  locale: string,
  at = new Date(),
): T {
  if (!item.trackStock) return item;
  const today = venueDayKey(locale, at);
  if (item.stockResetOn === today) return item;
  return {
    ...item,
    stock: item.stockDaily ?? item.stock,
    stockResetOn: today,
  };
}

export function isOutOfStock(item: MenuItemStockFields): boolean {
  return item.trackStock && item.stock <= 0;
}

export function canFulfillQty(item: MenuItemStockFields, qty: number): boolean {
  if (!item.trackStock) return true;
  return item.stock >= qty;
}
