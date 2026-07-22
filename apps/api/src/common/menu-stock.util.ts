import { ApiDomainErrorCode } from './api-error.codes';
import { apiConflictException } from './api-error.util';
import {
  calendarDayInTimeZone,
  resolveVenueTimeZone,
} from './venue-timezone.util';

/**
 * Calendar day key in venue timezone (YYYY-MM-DD).
 * Accepts either an IANA timezone (`Europe/Warsaw`) or a BCP-47 locale
 * (`pl`, `en-US`) for backward compatibility with callers that still pass locale.
 */
export function venueDayKey(timezoneOrLocale: string, at = new Date()): string {
  const timeZone = resolveVenueTimeZone({
    timezone: timezoneOrLocale,
    locale: timezoneOrLocale,
  });
  return calendarDayInTimeZone(timeZone, at);
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
  timezoneOrLocale: string,
  at = new Date(),
): T {
  if (!item.trackStock) return item;
  const today = venueDayKey(timezoneOrLocale, at);
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

/** §36 — pre-check tracked stock before decrement (409 when insufficient). */
export function assertMenuStockQty(
  item: MenuItemStockFields,
  qty: number,
  message?: string,
): void {
  if (canFulfillQty(item, qty)) return;
  throw apiConflictException(
    ApiDomainErrorCode.MENU_STOCK_INSUFFICIENT,
    message ?? `Not enough stock (${item.stock} left).`,
    { menuItemId: item.id, requested: qty, available: item.stock },
  );
}
