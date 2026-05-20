export const SUPPORTED_LOCALES = [

  { code: "en", label: "English" },

  { code: "pl", label: "Polski" },

  { code: "de", label: "Deutsch" },

  { code: "fr", label: "Français" },

  { code: "es", label: "Español" },

  { code: "ar", label: "العربية" },

] as const;



export const SUPPORTED_CURRENCIES = [

  { code: "EUR", label: "Euro (€)", symbol: "€" },

  { code: "USD", label: "US Dollar ($)", symbol: "$" },

  { code: "GBP", label: "British Pound (£)", symbol: "£" },

  { code: "PLN", label: "Polish Złoty (zł)", symbol: "zł" },

  { code: "CZK", label: "Czech Koruna (Kč)", symbol: "Kč" },

  { code: "CHF", label: "Swiss Franc (CHF)", symbol: "CHF" },

  { code: "SEK", label: "Swedish Krona (kr)", symbol: "kr" },

  { code: "NOK", label: "Norwegian Krone (kr)", symbol: "kr" },

  { code: "DKK", label: "Danish Krone (kr)", symbol: "kr" },

  { code: "HUF", label: "Hungarian Forint (Ft)", symbol: "Ft" },

  { code: "RON", label: "Romanian Leu (lei)", symbol: "lei" },

  { code: "AED", label: "UAE Dirham (د.إ)", symbol: "د.إ" },

  { code: "SAR", label: "Saudi Riyal (﷼)", symbol: "﷼" },

  { code: "TRY", label: "Turkish Lira (₺)", symbol: "₺" },

  { code: "IQD", label: "Iraqi Dinar (ع.د)", symbol: "ع.د" },

  { code: "EGP", label: "Egyptian Pound (E£)", symbol: "E£" },

  { code: "PKR", label: "Pakistani Rupee (₨)", symbol: "₨" },

  { code: "CNY", label: "Chinese Yuan (¥)", symbol: "¥" },

] as const;



export type ShopPreferences = {

  locale: string;

  currency: string;

};



export function localeLabel(code: string) {

  return SUPPORTED_LOCALES.find((l) => l.code === code)?.label ?? code;

}



export function currencyLabel(code: string) {

  return (

    SUPPORTED_CURRENCIES.find((c) => c.code === code)?.label ?? code

  );

}


