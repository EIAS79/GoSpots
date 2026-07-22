import { coerceMoney, type MoneyWire } from "./money";

export function formatMoney(
  n: MoneyWire,
  currency = "EUR",
  locale = "en",
) {
  const amount = coerceMoney(n);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export function formatDate(iso: string, locale = "en") {
  return new Date(iso).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
