/** Guest-facing locale & currency choices on the public site. */

export const PUBLIC_LOCALES = [
  { code: "en", label: "English", short: "EN" },
  { code: "pl", label: "Polski", short: "PL" },
  { code: "de", label: "Deutsch", short: "DE" },
  { code: "fr", label: "Français", short: "FR" },
  { code: "es", label: "Español", short: "ES" },
  { code: "ar", label: "العربية", short: "AR" },
] as const;

export type PublicLocale = (typeof PUBLIC_LOCALES)[number]["code"];

export const PUBLIC_CURRENCIES = [
  { code: "PLN", label: "Polish Złoty", symbol: "zł" },
  { code: "EUR", label: "Euro", symbol: "€" },
  { code: "USD", label: "US Dollar", symbol: "$" },
  { code: "AED", label: "UAE Dirham", symbol: "د.إ" },
  { code: "SAR", label: "Saudi Riyal", symbol: "﷼" },
  { code: "EGP", label: "Egyptian Pound", symbol: "E£" },
] as const;

export type PublicCurrency = (typeof PUBLIC_CURRENCIES)[number]["code"];

export const PUBLIC_LOCALE_CODES = PUBLIC_LOCALES.map((l) => l.code);
export const PUBLIC_CURRENCY_CODES = PUBLIC_CURRENCIES.map((c) => c.code);

export function isPublicLocale(code: string): code is PublicLocale {
  return (PUBLIC_LOCALE_CODES as readonly string[]).includes(code);
}

export function isPublicCurrency(code: string): code is PublicCurrency {
  return (PUBLIC_CURRENCY_CODES as readonly string[]).includes(code);
}

export const PUBLIC_PREFS_STORAGE_KEY = "gospots-public-prefs";
export const LEGACY_PUBLIC_PREFS_STORAGE_KEY = "Locora-public-prefs";
