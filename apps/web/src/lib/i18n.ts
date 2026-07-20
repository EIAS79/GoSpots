import type { SupportedLocale } from "./locale-currency";
import {
  arLocaleBlocks,
  deLocaleBlocks,
  esLocaleBlocks,
  frLocaleBlocks,
} from "./i18n-locale-blocks";

type DictTree = {
  [key: string]: string | string[] | DictTree;
};

function getPath(tree: DictTree, path: string): string | string[] | undefined {
  const parts = path.split(".");
  let cur: string | string[] | DictTree | undefined = tree;
  for (const p of parts) {
    if (cur == null || typeof cur === "string" || Array.isArray(cur)) {
      return undefined;
    }
    cur = cur[p];
  }
  if (typeof cur === "string" || Array.isArray(cur)) return cur;
  return undefined;
}

const en: DictTree = {
  nav: {
    group: {
      overview: "Overview",
      venue: "Venue",
      operations: "Operations",
      finance: "Finance",
      team: "Team",
    },
    overview: "Overview",
    subscription: "Subscription & plan",
    notifications: "Notifications",
    audit: "Audit log",
    reviews: "Reviews",
    settings: "Shop settings",
    messages: "Guest messages",
    menu: "Menu",
    gallery: "Gallery",
    hours: "Hours & schedule",
    notes: "Shift notes",
    gaming: "Gaming setup",
    dining: "Dining layout",
    sessions: "Reservations",
    orders: "Menu orders",
    playBilling: "Game billing",
    finance: "Finance",
    staff: "Employee accounts",
  },
  common: {
    save: "Save",
    cancel: "Cancel",
    loading: "Loading…",
    error: "Something went wrong.",
    convert: "Convert",
    amount: "Amount",
    from: "From",
    to: "To",
    add: "Add",
    edit: "Edit",
    remove: "Remove",
    preview: "Preview",
    phone: "Phone",
    email: "Email",
    date: "Date",
    opens: "Opens",
    closes: "Closes",
    saving: "Saving…",
    saved: "Saved",
    willSave: "Will save…",
    allSaved: "All changes saved",
    whatYouCanDo: "What you can do here",
    aboutSection: "About this section",
    viewOnly: "View-only — ask your admin for edit access.",
  },
  subscription: {
    title: "Subscription & features",
    paymentSubmitted:
      "Payment submitted. If modules are still locked, wait a few seconds for the webhook — then refresh.",
    setupTrial:
      "Pick features for {pack} and save — matching dashboard sections unlock. You can change them freely during the trial.",
    setupPaid:
      "Choose the features below for {pack}, save, then start billing when you’re ready. Nothing is charged until then.",
    trialHeadline: "{days}-day free trial · {left} {dayWord} left",
    day: "day",
    days: "days",
    trialBody:
      "Add/remove features anytime — visibility updates when you save. Up to {seats} employee seats free with Team accounts. After {ends}, everything turns off until you pay ({price}/mo) — no charge without checkout. Your data stays.",
    trialEndsFallback: "trial ends",
    trialEndedTitle: "Trial ended — features are off until you pay",
    trialEndedBody:
      "Adjust your plan below if needed, then start billing for {price}/mo. Nothing is charged without your consent. All your data is still here and returns when features turn back on.",
    activeTrial: "Active trial",
    paidActive: "Paid · active",
    featuresTotal: "Features total {price}/mo",
    staffSeats: " · Staff seats {used}/{limit}",
    employeeSeatsNone: " · Employee seats 0/0 (buy on Team accounts)",
    loadError: "Could not load subscription.",
    venueType: "Venue type",
    venueTypeHintTrial:
      "Free. Guides suggestions — and with features below, updates dashboard visibility when you save.",
    venueTypeHintPaid:
      "Free. Guides suggestions — type/feature edits on a paid plan take effect next month.",
    venueTypeHintDefault: "Free. Guides suggestions.",
    featuresNeeded: "Features you need",
    featuresHintTrial:
      "Add or remove anytime during trial. Save to refresh sidebar visibility — data is kept even when a feature is off.",
    featuresHintPaid:
      "Edits schedule for the next billing month. No refunds mid-cycle; data stays if you turn something off.",
    featuresHintDefault:
      "Choose what you’ll pay for. Nothing is charged until you start billing below.",
    suggestedBanner:
      "Suggested for your venue type — save to unlock matching dashboard sections.",
    suggested: "Suggested",
    perMo: "/mo",
    perSeat: "/seat",
    payToUnlockTitle: "Pay to unlock modules",
    payToUnlockBody:
      "Your feature picks are saved for checkout. Sidebar sections stay hidden until payment succeeds and the subscription is active again.",
    pendingTitle: "Changes scheduled for next billing month",
    pendingBody:
      "You already paid this period — no mid-cycle refunds or cuts. New features / seats apply{when}{thenPrice}. Current access stays until then. Your data is never deleted.",
    pendingOn: " on {date}",
    pendingPeriodEnd: " at period end",
    pendingThen: " · then {price}/mo",
    checkoutReadyTitle: "Features ready for checkout",
    checkoutReadyBody:
      "Saved selection{pricePart}. Complete payment to unlock these modules in the dashboard.",
    checkoutPricePart: " · {price}/mo",
    employeeSeats: "Employee seats",
    seatsHintTrial:
      "Free during trial — max {max} logins. After trial you buy seats ({price}/seat).",
    seatsHintPaid:
      "Choose how many logins to buy, then create accounts on Employees. {price} × seats / month.",
    trialSeats: "Trial · {used}/{max}",
    seatErrorTrial:
      "Set 1–{max} employee seats, or turn off Team accounts.",
    seatErrorPaid:
      "Set how many employee seats to buy (at least 1), or turn off Team accounts.",
    saveError: "Could not save features.",
    savedScheduled:
      "Scheduled for next billing month. Current access unchanged until then.",
    savedOk: "Saved. Sidebar visibility updated — your data was kept.",
    scheduleNext: "Schedule for next month",
    saveFeatures: "Save features",
    selectOne: "Select at least one feature to continue.",
    featureDetails: "Feature details",
    billingTitle: "Billing",
    billingBody:
      "Payments run through Lemon Squeezy (Merchant of Record) — multi-currency checkout, VAT/tax handled for you. Your pack + add-ons total {price}/mo.",
    billingManageHint:
      "Manage payment method, invoices, or cancel in the Lemon Squeezy portal. Pack changes you save here apply at the next billing period.",
    billingNotConfigured:
      "Billing keys are not set on the API yet. Add LEMON_SQUEEZY_* env vars to enable checkout.",
    manageBilling: "Manage billing",
    addPayment: "Add payment method",
    activate: "Activate subscription",
    billingFailed: "Billing action failed.",
    viewOnlyFinance:
      "View-only — ask an admin for transaction write access to edit records.",
  },
  financeHub: {
    overview: "Overview",
    transactions: "Transactions",
    invoices: "Invoices",
    losses: "Losses",
    reports: "Reports",
  },
  pack: {
    gaming: {
      name: "Gaming venue",
      tagline: "Stations, live map bookings, and play billing.",
    },
    dining: {
      name: "Restaurant",
      tagline: "Tables, digital booking, menu, and kitchen tickets.",
    },
    bar: {
      name: "Bar & lounge",
      tagline: "Menu, light reservations, and counter sales.",
    },
    hotel_fb: {
      name: "Hotel F&B",
      tagline: "Restaurant ops plus staff seats for hotel teams.",
    },
    mixed: {
      name: "Mixed venue",
      tagline: "Gaming floor and dining under one roof.",
    },
  },
  addon: {
    ops_alerts: {
      name: "Ops alerts, audit & reviews",
      tagline: "Notifications, activity log, and guest review inbox.",
      details:
        "Unlocks Notifications, Audit log, and Reviews. See booking alerts, staff actions, and guest ratings in one ops suite — filter and manage reviews from the dashboard.",
    },
    gaming_suite: {
      name: "Gaming floor suite",
      tagline: "Layout, setup, play billing, and game reservations.",
      details:
        "For gaming venues: design the floor map, configure stations/tables, take gaming reservations, and run play billing / session charges from the dashboard.",
    },
    menu_orders: {
      name: "Menu & kitchen orders",
      tagline: "Catalog, sections, and kitchen tickets.",
      details:
        "Build food and drink menus, manage stock and sections, and process menu orders / kitchen tickets. Ideal for restaurants, bars, and cafés.",
    },
    dining_floor: {
      name: "Dining floor & bookings",
      tagline: "Table layout and restaurant reservations.",
      details:
        "Design dining rooms and table layouts, then take and manage restaurant reservations. Works alongside Menu & kitchen orders when you serve food.",
    },
    venue_presence: {
      name: "Venue page & discovery",
      tagline: "Public venue page plus directory placement.",
      details:
        "Publish your venue on GoSpots with a dedicated public page, and unlock advertising / promoted placement in the venues directory so more guests can find you.",
    },
    guest_chat: {
      name: "Guest messaging",
      tagline: "Live chat with guests on your venue page.",
      details:
        "Guests start a private Uber-style chat from your public page, wait until staff joins, then message in real time. Staff can pause, end, reopen, or delete; guests can ping for attention.",
    },
    team_accounts: {
      name: "Team accounts",
      tagline: "Employee seats — priced per seat / month.",
      details:
        "Buy how many employee seats you need (starts at 0). Then create one login per seat with roles and permissions. Each seat is one person.",
    },
  },
  featureGate: {
    locked: "{title} is locked",
    body:
      "This module is not included in your current pack or add-ons. Unlock {feature} from Subscription to use it.",
    cta: "View packs & modules",
    labels: {
      notifications: "Notifications",
      audit: "Audit log",
      reviews: "Reviews",
      resource: "Floor & setup",
      reservation: "Reservations",
      transaction: "Transactions",
      reports: "Reports",
      menu: "Menu",
      marketing: "Marketing",
      messaging: "Guest messaging",
      roles: "Roles",
      memberships: "Team",
      notes: "Shift notes",
    },
  },
  settings: {
    regional: "Regional preferences",
    language: "Dashboard language",
    currency: "Venue currency",
    currencyHint:
      "All new menu & game prices are entered and shown in {currency}. Preview: {preview}",
    currencyConvertHint:
      "Changing currency converts your live catalog with live market rates (paid orders keep original amounts).",
    currencyConfirm:
      "Convert all menu & game prices from {from} to {to} using live exchange rates?\n\nPast orders stay as recorded. New prices will be in {to}.",
    catalogConverted:
      "Catalog converted {from} → {to} at {rate} ({menu} menu · {rates} rates · live {when}).",
    converter: "Currency converter",
    multiTargets: "Multiple targets",
    visibility: "Visibility",
    publishPage: "Publish public page",
    publishPageHint:
      "Turns on your guest page at /venue/{slug}. People need this link (or the directory) to find you.",
    listDirectory: "List in venue directory",
    listDirectoryHint:
      "Shows your venue in the browse list at /venues. Off = page stays live, hidden from the directory.",
    publishLocked: "Requires the Venue page & discovery add-on.",
    listLocked: "Unlock Venue page & discovery to appear in the directory.",
    publicUrl: "Public URL:",
    identity: "Venue identity",
    identityHint:
      "Internal name appears in your dashboard sidebar. Display name is what players see on marketing and your public page.",
    dashboardName: "Dashboard venue name",
    marketingName: "Marketing display name",
    marketingPlaceholder: "Same as venue name",
    shortDescription: "Short description",
    location: "Location & contact",
    street: "Street address",
    city: "City",
    country: "Country",
    reviewsTitle: "Guest reviews",
    reviewsHint:
      "Applies to venue reviews guests leave on your public page. Staff publish approved reviews from the Reviews dashboard.",
    reviewsOn: "On — accept; staff publish",
    reviewsOnHint:
      "Guests can leave venue reviews; ratings appear publicly after you publish them from Reviews.",
    reviewsHidden: "Hidden — accept but don't show",
    reviewsHiddenHint:
      "Guests can still submit; you get notified, but ratings stay off the public page.",
    reviewsOff: "Off — no reviews at all",
    reviewsOffHint: "Nobody can leave reviews on this venue.",
    categories: "Venue categories",
    categoriesHint:
      "How players find you on /venues. Pick presets (gaming center, bar, lounge…) or add your own.",
    categoriesPlaceholder: "Custom category (e.g. Rooftop terrace)",
    reloadOverlay: "Updating venue name across your dashboard…",
    conversionFailed: "Conversion failed.",
  },
  hours: {
    weekly: "Weekly hours",
    weeklyHint: "Regular opening times guests see on your venue page.",
    closed: "Closed",
    noService: "No service",
    saveWeekly: "Save weekly hours",
    exceptions: "Closures & special days",
    exceptionsHint:
      "Private events, holidays, or different hours on a specific date.",
    noteOptional: "Note (optional)",
    notePlaceholder: "e.g. Staff party, maintenance",
    closedAllDay: "Closed all day",
    addDate: "Add date",
    noExceptions: "No upcoming exceptions.",
    specialHours: "Special hours",
    editException: "Edit exception",
    saveChanges: "Save changes",
    viewOnly: "View-only — ask your admin for hours edit access.",
    day: {
      "0": "Sunday",
      "1": "Monday",
      "2": "Tuesday",
      "3": "Wednesday",
      "4": "Thursday",
      "5": "Friday",
      "6": "Saturday",
    },
  },
  guide: {
    whatYouCanDo: "What you can do here",
    settings: {
      title: "Shop settings",
      description:
        "Venue profile, marketing display name, address, publish toggle, and regional preferences. Edits save automatically after 2 seconds.",
      caps: [
        "Set dashboard venue name and customer-facing display name.",
        "Add address, city, country, phone, and email.",
        "Publish your venue on the marketing browse page.",
        "Set dashboard language and venue currency.",
        "Use the currency converter for multi-currency planning.",
      ],
    },
    hours: {
      title: "Hours & schedule",
      description:
        "Weekly opening hours and one-off closures or special hours for events and holidays.",
      caps: [
        "Set open/close times for each day of the week.",
        "Mark regular closed days (e.g. Sunday).",
        "Add closure dates or special hours for private events.",
      ],
    },
    overview: {
      title: "Overview",
      description:
        "Your live venue snapshot — occupancy, revenue hints, and quick links to daily work.",
      caps: [
        "See how busy the venue is right now.",
        "Jump to reservations, orders, or finance from one place.",
        "Check subscription status and trial time remaining.",
      ],
    },
    gallery: {
      title: "Gallery",
      description:
        "Marketing cover image and extra photos on your public venue page.",
      caps: [
        "Upload the main cover used on marketing and your public profile.",
        "Add gallery photos customers browse on your venue page.",
        "Promote any gallery shot to the marketing cover.",
      ],
    },
    menu: {
      title: "Menu",
      description:
        "Your live venue menu — sections, items, prices, meal periods, optional stock, and photos guests will see.",
      caps: [
        "Create sections with breakfast, lunch, dinner, or custom hours.",
        "Add items with description, price, and photos.",
        "Track stock per item when you sell limited quantities.",
      ],
    },
    notes: {
      title: "Shift notes",
      description:
        "Leave handoff notes for the next person on duty — title, details, day/time, and how urgent it is.",
      caps: [
        "See who wrote each note and their role.",
        "Mark importance: info, normal, important, or urgent.",
        "Archive notes when they're no longer needed.",
      ],
    },
    reviews: {
      title: "Reviews",
      description:
        "Guest ratings and comments from your public venue page. Hide or delete anything that should not stay public.",
      caps: [
        "Browse reviews with guest name, date, rating, and comment.",
        "Filter by published or hidden status.",
        "Hide a review from the public page or publish it again.",
        "Delete spam or abusive reviews permanently.",
      ],
    },
    notifications: {
      title: "Notifications",
      description:
        "Alerts about trials, subscriptions, reservations, tables, billing, and team sign-ins.",
      caps: [
        "Filter by date, section, and read status.",
        "Mark items read or unread, or mark all as read.",
        "Archive selected items or everything matching your filter.",
      ],
    },
    audit: {
      title: "Audit log",
      description:
        "A history of sensitive changes — who did what, when, and in which area of the dashboard.",
      caps: [
        "Filter by date, section, action type, or search text.",
        "Expand entries to see technical details.",
        "Export the log to CSV for compliance or internal review.",
      ],
    },
    subscription: {
      title: "Subscription & features",
      description:
        "Pay only for features you keep. Nothing is charged without you starting checkout. Turning a feature off never deletes your data.",
      caps: [
        "Free trial — add/remove features anytime; sidebar updates on save.",
        "Up to 3 employee logins during trial when Team accounts is on.",
        "After trial: all features stay off until you pay — no auto-charge.",
        "On a paid plan, feature changes apply next billing month (no mid-cycle refunds).",
      ],
    },
    playBilling: {
      title: "Game billing",
      description:
        "Collect payment for game sessions — booked and walk-in. Sessions move here automatically when they end.",
      caps: [
        "In progress shows live bookings and walk-ins currently playing.",
        "Awaiting payment lists finished sessions — mark paid when you collect.",
        "Edit time, amount, or apply a percentage discount before payment.",
      ],
    },
    sessions: {
      title: "Reservations",
      description:
        "Bookings for tables, PCs, lanes, and other units — confirm, check in, and manage the day.",
      caps: [
        "See today's schedule and upcoming reservations.",
        "Create, edit, or cancel bookings.",
        "Check guests in and free units when they leave.",
      ],
    },
    orders: {
      title: "Menu orders",
      description: "Track and fulfill menu orders from guests and the floor.",
      caps: [
        "See open and completed orders.",
        "Update order status as kitchen and bar prepare items.",
        "Review totals that feed into finance.",
      ],
    },
    finance: {
      title: "Finance",
      description:
        "Revenue overview, transaction ledger, losses, and reports — not where you run the kitchen or floor.",
      caps: [
        "See combined revenue from menu, play, and reservations (read-only rollups).",
        "Record quick counter sales and track losses.",
        "Run 1–90 day reports with charts, print, and CSV export.",
        "Menu orders and play billing stay under Operations; reservations under Reservations.",
      ],
    },
    staff: {
      title: "Employee accounts",
      description: "Invite staff, assign roles, and manage who can access the dashboard.",
      caps: [
        "Create employee logins within your seat limit.",
        "Assign permissions by role.",
        "Disable access when someone leaves the team.",
      ],
    },
    resources: {
      title: "Gaming setup",
      description: "Stations, lanes, rates, and offering configuration for playable units.",
      caps: [
        "Create categories for PCs, consoles, bowling, and more.",
        "Set rates guests see when booking.",
        "Manage how many units are available.",
      ],
    },
    dining: {
      title: "Dining layout",
      description: "Tables, floors, and seating layout for reservations and service.",
      caps: [
        "Organize tables by floor or zone.",
        "Set capacity for party-size booking.",
        "Keep the floor plan aligned with real seating.",
      ],
    },
    messages: {
      title: "Guest messages",
      description: "Chat and contact-form messages from your public venue page.",
      caps: [
        "Reply to live guest chat.",
        "Review contact-form submissions.",
        "Keep guest conversations in one inbox.",
      ],
    },
  },
};

const pl: DictTree = {
  nav: {
    group: {
      overview: "Przegląd",
      venue: "Lokal",
      operations: "Operacje",
      finance: "Finanse",
      team: "Zespół",
    },
    overview: "Przegląd",
    subscription: "Subskrypcja i plan",
    notifications: "Powiadomienia",
    audit: "Dziennik audytu",
    reviews: "Opinie",
    settings: "Ustawienia lokalu",
    messages: "Wiadomości gości",
    menu: "Menu",
    gallery: "Galeria",
    hours: "Godziny i harmonogram",
    notes: "Notatki zmianowe",
    gaming: "Strefa gier",
    dining: "Układ sali",
    sessions: "Rezerwacje",
    orders: "Zamówienia menu",
    playBilling: "Rozliczenia gier",
    finance: "Finanse",
    staff: "Konta pracowników",
  },
  common: {
    save: "Zapisz",
    cancel: "Anuluj",
    loading: "Ładowanie…",
    error: "Coś poszło nie tak.",
    convert: "Przelicz",
    amount: "Kwota",
    from: "Z",
    to: "Na",
    add: "Dodaj",
    edit: "Edytuj",
    remove: "Usuń",
    preview: "Podgląd",
    phone: "Telefon",
    email: "E-mail",
    date: "Data",
    opens: "Otwarcie",
    closes: "Zamknięcie",
    saving: "Zapisywanie…",
    saved: "Zapisano",
    willSave: "Zapisze się…",
    allSaved: "Wszystkie zmiany zapisane",
    whatYouCanDo: "Co możesz tu zrobić",
    aboutSection: "O tej sekcji",
    viewOnly: "Tylko podgląd — poproś administratora o dostęp do edycji.",
  },
  subscription: {
    title: "Subskrypcja i funkcje",
    paymentSubmitted:
      "Płatność wysłana. Jeśli moduły są nadal zablokowane, poczekaj chwilę na webhook — potem odśwież.",
    setupTrial:
      "Wybierz funkcje dla {pack} i zapisz — pasujące sekcje panelu się odblokują. W okresie próbnym możesz zmieniać je swobodnie.",
    setupPaid:
      "Wybierz funkcje poniżej dla {pack}, zapisz, a potem uruchom rozliczenia, gdy będziesz gotowy. Nic nie jest obciążane wcześniej.",
    trialHeadline: "{days}-dniowy okres próbny · zostało {left} {dayWord}",
    day: "dzień",
    days: "dni",
    trialBody:
      "Dodawaj i usuwaj funkcje w dowolnej chwili — widoczność odświeża się po zapisaniu. Do {seats} miejsc pracowniczych gratis z Kontami zespołu. Po {ends} wszystko się wyłączy, dopóki nie zapłacisz ({price}/mies.) — bez obciążenia bez checkoutu. Dane zostają.",
    trialEndsFallback: "końcu okresu próbnego",
    trialEndedTitle: "Okres próbny zakończony — funkcje wyłączone do płatności",
    trialEndedBody:
      "W razie potrzeby dostosuj plan poniżej, potem uruchom rozliczenia za {price}/mies. Nic nie jest obciążane bez Twojej zgody. Dane nadal tu są i wrócą po włączeniu funkcji.",
    activeTrial: "Aktywna próba",
    paidActive: "Opłacone · aktywne",
    featuresTotal: "Funkcje łącznie {price}/mies.",
    staffSeats: " · Miejsca personelu {used}/{limit}",
    employeeSeatsNone: " · Miejsca pracowników 0/0 (kup w Kontach zespołu)",
    loadError: "Nie udało się wczytać subskrypcji.",
    venueType: "Typ lokalu",
    venueTypeHintTrial:
      "Gratis. Podpowiada sugestie — wraz z funkcjami poniżej aktualizuje widoczność panelu po zapisaniu.",
    venueTypeHintPaid:
      "Gratis. Podpowiada sugestie — zmiany typu/funkcji na płatnym planie obowiązują od następnego miesiąca.",
    venueTypeHintDefault: "Gratis. Podpowiada sugestie.",
    featuresNeeded: "Potrzebne funkcje",
    featuresHintTrial:
      "Dodawaj lub usuwaj w okresie próbnym. Zapisz, aby odświeżyć widoczność menu — dane zostają nawet gdy funkcja jest wyłączona.",
    featuresHintPaid:
      "Zmiany obowiązują od następnego miesiąca rozliczeniowego. Bez zwrotów w środku cyklu; dane zostają po wyłączeniu.",
    featuresHintDefault:
      "Wybierz, za co zapłacisz. Nic nie jest obciążane, dopóki nie uruchomisz rozliczeń poniżej.",
    suggestedBanner:
      "Sugerowane dla Twojego typu lokalu — zapisz, aby odblokować pasujące sekcje panelu.",
    suggested: "Sugerowane",
    perMo: "/mies.",
    perSeat: "/miejsce",
    payToUnlockTitle: "Zapłać, aby odblokować moduły",
    payToUnlockBody:
      "Wybrane funkcje są zapisane do checkoutu. Sekcje w menu pozostają ukryte, dopóki płatność nie przejdzie i subskrypcja nie będzie aktywna.",
    pendingTitle: "Zmiany zaplanowane na następny miesiąc rozliczeniowy",
    pendingBody:
      "Ten okres jest już opłacony — bez zwrotów i cięć w środku cyklu. Nowe funkcje / miejsca obowiązują{when}{thenPrice}. Obecny dostęp zostaje do tego czasu. Dane nigdy nie są usuwane.",
    pendingOn: " w dniu {date}",
    pendingPeriodEnd: " na koniec okresu",
    pendingThen: " · potem {price}/mies.",
    checkoutReadyTitle: "Funkcje gotowe do checkoutu",
    checkoutReadyBody:
      "Zapisany wybór{pricePart}. Dokończ płatność, aby odblokować te moduły w panelu.",
    checkoutPricePart: " · {price}/mies.",
    employeeSeats: "Miejsca pracowników",
    seatsHintTrial:
      "Gratis w okresie próbnym — max {max} loginów. Po próbie kupujesz miejsca ({price}/miejsce).",
    seatsHintPaid:
      "Wybierz ile loginów kupić, potem utwórz konta w Pracownikach. {price} × miejsca / miesiąc.",
    trialSeats: "Próba · {used}/{max}",
    seatErrorTrial:
      "Ustaw 1–{max} miejsc pracowniczych albo wyłącz Konta zespołu.",
    seatErrorPaid:
      "Ustaw ile miejsc kupić (min. 1) albo wyłącz Konta zespołu.",
    saveError: "Nie udało się zapisać funkcji.",
    savedScheduled:
      "Zaplanowano na następny miesiąc. Obecny dostęp bez zmian do tego czasu.",
    savedOk: "Zapisano. Widoczność menu zaktualizowana — dane zachowane.",
    scheduleNext: "Zaplanuj na następny miesiąc",
    saveFeatures: "Zapisz funkcje",
    selectOne: "Wybierz co najmniej jedną funkcję, aby kontynuować.",
    featureDetails: "Szczegóły funkcji",
    billingTitle: "Płatności",
    billingBody:
      "Płatności przez Lemon Squeezy (Merchant of Record) — checkout w wielu walutach, VAT/podatki załatwione. Pakiet + dodatki: {price}/mies.",
    billingManageHint:
      "Metoda płatności, faktury lub anulowanie w portalu Lemon Squeezy. Zmiany pakietu zapisane tutaj obowiązują od następnego okresu.",
    billingNotConfigured:
      "Klucze rozliczeń nie są jeszcze ustawione w API. Dodaj zmienne LEMON_SQUEEZY_*, aby włączyć checkout.",
    manageBilling: "Zarządzaj płatnościami",
    addPayment: "Dodaj metodę płatności",
    activate: "Aktywuj subskrypcję",
    billingFailed: "Akcja rozliczeniowa nie powiodła się.",
    viewOnlyFinance:
      "Tylko podgląd — poproś admina o prawo zapisu transakcji, aby edytować rekordy.",
  },
  financeHub: {
    overview: "Przegląd",
    transactions: "Transakcje",
    invoices: "Faktury",
    losses: "Straty",
    reports: "Raporty",
  },
  pack: {
    gaming: {
      name: "Lokal gamingowy",
      tagline: "Stanowiska, rezerwacje na mapie i rozliczenia gry.",
    },
    dining: {
      name: "Restauracja",
      tagline: "Stoliki, rezerwacje cyfrowe, menu i bilety kuchenne.",
    },
    bar: {
      name: "Bar i lounge",
      tagline: "Menu, lekkie rezerwacje i sprzedaż przy ladzie.",
    },
    hotel_fb: {
      name: "Hotel F&B",
      tagline: "Operacje restauracji plus miejsca dla zespołu hotelu.",
    },
    mixed: {
      name: "Lokal mieszany",
      tagline: "Strefa gier i gastronomia pod jednym dachem.",
    },
  },
  addon: {
    ops_alerts: {
      name: "Alerty, audyt i opinie",
      tagline: "Powiadomienia, dziennik aktywności i skrzynka opinii gości.",
      details:
        "Odblokowuje Powiadomienia, Dziennik audytu i Opinie. Alerty o rezerwacjach, działania personelu i oceny gości w jednym miejscu.",
    },
    gaming_suite: {
      name: "Pakiet strefy gier",
      tagline: "Układ, konfiguracja, rozliczenia gry i rezerwacje.",
      details:
        "Dla lokali gamingowych: mapa sali, stanowiska/stoły, rezerwacje gier oraz rozliczenia sesji w panelu.",
    },
    menu_orders: {
      name: "Menu i zamówienia kuchni",
      tagline: "Katalog, sekcje i bilety kuchenne.",
      details:
        "Buduj menu jedzenia i napojów, zarządzaj stanami i sekcjami oraz realizuj zamówienia / bilety kuchenne.",
    },
    dining_floor: {
      name: "Sala i rezerwacje",
      tagline: "Układ stolików i rezerwacje restauracyjne.",
      details:
        "Projektuj sale i układy stolików, potem przyjmuj i zarządzaj rezerwacjami. Działa razem z Menu i zamówieniami kuchni.",
    },
    venue_presence: {
      name: "Strona lokalu i odkrywanie",
      tagline: "Publiczna strona oraz obecność w katalogu.",
      details:
        "Opublikuj lokal na GoSpots z dedykowaną stroną i odblokuj promocję w katalogu lokali.",
    },
    guest_chat: {
      name: "Wiadomości gości",
      tagline: "Czat na żywo z gośćmi na stronie lokalu.",
      details:
        "Goście zaczynają prywatny czat ze strony publicznej, czekają aż personel dołączy, potem piszą na żywo.",
    },
    team_accounts: {
      name: "Konta zespołu",
      tagline: "Miejsca pracowników — cena za miejsce / miesiąc.",
      details:
        "Kup tyle miejsc, ile potrzebujesz (od 0). Potem utwórz jeden login na miejsce z rolami i uprawnieniami.",
    },
  },
  featureGate: {
    locked: "{title} jest zablokowane",
    body:
      "Ten moduł nie jest w Twoim pakiecie ani dodatkach. Odblokuj {feature} w Subskrypcji, aby z niego korzystać.",
    cta: "Zobacz pakiety i moduły",
    labels: {
      notifications: "Powiadomienia",
      audit: "Dziennik audytu",
      reviews: "Opinie",
      resource: "Sala i konfiguracja",
      reservation: "Rezerwacje",
      transaction: "Transakcje",
      reports: "Raporty",
      menu: "Menu",
      marketing: "Marketing",
      messaging: "Wiadomości gości",
      roles: "Role",
      memberships: "Zespół",
      notes: "Notatki zmiany",
    },
  },
  settings: {
    regional: "Preferencje regionalne",
    language: "Język panelu",
    currency: "Waluta lokalu",
    currencyHint:
      "Wszystkie nowe ceny menu i gier są wpisywane i wyświetlane w {currency}. Podgląd: {preview}",
    currencyConvertHint:
      "Zmiana waluty przelicza aktualny katalog według kursów rynkowych (opłacone zamówienia zachowują kwoty).",
    currencyConfirm:
      "Przeliczyć wszystkie ceny menu i gier z {from} na {to} według aktualnych kursów?\n\nMinione zamówienia pozostaną bez zmian. Nowe ceny będą w {to}.",
    catalogConverted:
      "Katalog przeliczony {from} → {to} po kursie {rate} ({menu} pozycji menu · {rates} stawek · na żywo {when}).",
    converter: "Kalkulator walut",
    multiTargets: "Wiele walut docelowych",
    visibility: "Widoczność",
    publishPage: "Opublikuj stronę publiczną",
    publishPageHint:
      "Włącza stronę gościa pod /venue/{slug}. Goście potrzebują tego linku (lub katalogu), żeby Cię znaleźć.",
    listDirectory: "Pokaż w katalogu lokali",
    listDirectoryHint:
      "Pokazuje lokal na liście /venues. Wyłączone = strona działa, ale nie ma Cię w katalogu.",
    publishLocked: "Wymaga dodatku Strona lokalu i odkrywanie.",
    listLocked: "Odblokuj Stronę lokalu i odkrywanie, aby pojawić się w katalogu.",
    publicUrl: "Publiczny adres URL:",
    identity: "Tożsamość lokalu",
    identityHint:
      "Nazwa wewnętrzna pojawia się na pasku bocznym panelu. Nazwa marketingowa to to, co widzą gracze w katalogu i na stronie publicznej.",
    dashboardName: "Nazwa lokalu w panelu",
    marketingName: "Nazwa marketingowa",
    marketingPlaceholder: "Taka sama jak nazwa lokalu",
    shortDescription: "Krótki opis",
    location: "Lokalizacja i kontakt",
    street: "Ulica i numer",
    city: "Miasto",
    country: "Kraj",
    reviewsTitle: "Opinie gości",
    reviewsHint:
      "Dotyczy opinii o lokalu, które goście zostawiają na stronie publicznej. Personel publikuje zatwierdzone opinie w panelu Opinie.",
    reviewsOn: "Włączone — przyjmuj; personel publikuje",
    reviewsOnHint:
      "Goście mogą zostawiać opinie; oceny pojawiają się publicznie dopiero po publikacji w Opiniach.",
    reviewsHidden: "Ukryte — przyjmuj, ale nie pokazuj",
    reviewsHiddenHint:
      "Goście nadal mogą wysyłać opinie; dostajesz powiadomienie, ale oceny nie widać na stronie publicznej.",
    reviewsOff: "Wyłączone — bez opinii",
    reviewsOffHint: "Nikt nie może zostawić opinii o tym lokalu.",
    categories: "Kategorie lokalu",
    categoriesHint:
      "Jak gracze znajdują Cię na /venues. Wybierz gotowe (centrum gier, bar, lounge…) lub dodaj własne.",
    categoriesPlaceholder: "Własna kategoria (np. Taras na dachu)",
    reloadOverlay: "Aktualizowanie nazwy lokalu w całym panelu…",
    conversionFailed: "Przeliczenie nie powiodło się.",
  },
  hours: {
    weekly: "Godziny tygodniowe",
    weeklyHint: "Stałe godziny otwarcia widoczne na stronie lokalu.",
    closed: "Zamknięte",
    noService: "Brak obsługi",
    saveWeekly: "Zapisz godziny tygodniowe",
    exceptions: "Zamknięcia i dni specjalne",
    exceptionsHint:
      "Imprezy prywatne, święta lub inne godziny w konkretnym dniu.",
    noteOptional: "Notatka (opcjonalnie)",
    notePlaceholder: "np. Impreza firmowa, remont",
    closedAllDay: "Zamknięte przez cały dzień",
    addDate: "Dodaj datę",
    noExceptions: "Brak nadchodzących wyjątków.",
    specialHours: "Specjalne godziny",
    editException: "Edytuj wyjątek",
    saveChanges: "Zapisz zmiany",
    viewOnly: "Tylko podgląd — poproś administratora o dostęp do edycji godzin.",
    day: {
      "0": "Niedziela",
      "1": "Poniedziałek",
      "2": "Wtorek",
      "3": "Środa",
      "4": "Czwartek",
      "5": "Piątek",
      "6": "Sobota",
    },
  },
  guide: {
    whatYouCanDo: "Co możesz tu zrobić",
    settings: {
      title: "Ustawienia lokalu",
      description:
        "Profil lokalu, nazwa marketingowa, adres, publikacja i preferencje regionalne. Zmiany zapisują się automatycznie po 2 sekundach.",
      caps: [
        "Ustaw nazwę w panelu i nazwę widoczną dla klientów.",
        "Dodaj adres, miasto, kraj, telefon i e-mail.",
        "Opublikuj lokal na stronie katalogu.",
        "Ustaw język panelu i walutę lokalu.",
        "Użyj kalkulatora walut do planowania.",
      ],
    },
    hours: {
      title: "Godziny i harmonogram",
      description:
        "Tygodniowe godziny otwarcia oraz jednorazowe zamknięcia lub specjalne godziny na wydarzenia i święta.",
      caps: [
        "Ustaw godziny otwarcia i zamknięcia na każdy dzień tygodnia.",
        "Oznacz stałe dni zamknięcia (np. niedziela).",
        "Dodaj daty zamknięcia lub specjalne godziny na prywatne wydarzenia.",
      ],
    },
    overview: {
      title: "Przegląd",
      description:
        "Aktualny obraz lokalu — obłożenie, podpowiedzi przychodów i szybkie skróty do codziennej pracy.",
      caps: [
        "Zobacz, jak zajęty jest lokal w tej chwili.",
        "Przejdź do rezerwacji, zamówień lub finansów z jednego miejsca.",
        "Sprawdź status subskrypcji i pozostały czas okresu próbnego.",
      ],
    },
    gallery: {
      title: "Galeria",
      description: "Zdjęcie okładkowe i dodatkowe zdjęcia na publicznej stronie lokalu.",
      caps: [
        "Prześlij główną okładkę używaną w marketingu i profilu.",
        "Dodaj zdjęcia galerii przeglądane przez klientów.",
        "Ustaw dowolne zdjęcie jako okładkę marketingową.",
      ],
    },
    menu: {
      title: "Menu",
      description:
        "Aktualne menu lokalu — sekcje, pozycje, ceny, pory posiłków, opcjonalny stan magazynowy i zdjęcia.",
      caps: [
        "Twórz sekcje ze śniadaniem, obiadem, kolacją lub własnymi godzinami.",
        "Dodawaj pozycje z opisem, ceną i zdjęciami.",
        "Śledź stan magazynowy przy ograniczonej ilości.",
      ],
    },
    notes: {
      title: "Notatki zmianowe",
      description:
        "Zostaw notatki dla następnej osoby na zmianie — tytuł, szczegóły, dzień/godzina i pilność.",
      caps: [
        "Zobacz, kto napisał każdą notatkę i jaką ma rolę.",
        "Oznacz ważność: info, normalna, ważna lub pilna.",
        "Archiwizuj notatki, gdy nie są już potrzebne.",
      ],
    },
    reviews: {
      title: "Opinie",
      description:
        "Oceny i komentarze gości ze strony publicznej. Ukryj lub usuń to, co nie powinno być publiczne.",
      caps: [
        "Przeglądaj opinie z imieniem, datą, oceną i komentarzem.",
        "Filtruj według opublikowanych lub ukrytych.",
        "Ukryj opinię na stronie publicznej lub opublikuj ponownie.",
        "Trwale usuń spam lub obraźliwe opinie.",
      ],
    },
    notifications: {
      title: "Powiadomienia",
      description:
        "Alerty o okresie próbnym, subskrypcjach, rezerwacjach, stolikach, rozliczeniach i logowaniach zespołu.",
      caps: [
        "Filtruj według daty, sekcji i statusu przeczytania.",
        "Oznacz jako przeczytane lub nieprzeczytane.",
        "Archiwizuj wybrane lub wszystkie pasujące do filtra.",
      ],
    },
    audit: {
      title: "Dziennik audytu",
      description:
        "Historia wrażliwych zmian — kto, co, kiedy i w której części panelu.",
      caps: [
        "Filtruj według daty, sekcji, typu akcji lub tekstu.",
        "Rozwiń wpisy, aby zobaczyć szczegóły techniczne.",
        "Eksportuj dziennik do CSV.",
      ],
    },
    subscription: {
      title: "Subskrypcja i funkcje",
      description:
        "Płacisz tylko za funkcje, które zostawiasz. Nic nie jest obciążane bez startu checkoutu. Wyłączenie funkcji nigdy nie usuwa danych.",
      caps: [
        "Okres próbny — dodawaj i usuwaj funkcje w dowolnej chwili; menu odświeża się po zapisaniu.",
        "Do 3 loginów pracowników w okresie próbnym przy włączonych Kontach zespołu.",
        "Po próbie: wszystkie funkcje wyłączone do płatności — bez automatycznego obciążenia.",
        "Na płatnym planie zmiany funkcji obowiązują od następnego miesiąca (bez zwrotów w cyklu).",
      ],
    },
    playBilling: {
      title: "Rozliczenia gier",
      description:
        "Pobieraj płatności za sesje gier — z rezerwacją i bez. Sesje trafiają tu automatycznie po zakończeniu.",
      caps: [
        "W toku pokazuje aktywne rezerwacje i walk-iny.",
        "Oczekujące na płatność — oznacz jako opłacone po pobraniu.",
        "Edytuj czas, kwotę lub rabat procentowy przed płatnością.",
      ],
    },
    sessions: {
      title: "Rezerwacje",
      description:
        "Rezerwacje stolików, PC, torów i innych stanowisk — potwierdzaj, zamelduj i zarządzaj dniem.",
      caps: [
        "Zobacz dzisiejszy harmonogram i nadchodzące rezerwacje.",
        "Twórz, edytuj lub anuluj rezerwacje.",
        "Zamelduj gości i zwolnij stanowiska po wyjściu.",
      ],
    },
    orders: {
      title: "Zamówienia menu",
      description: "Śledź i realizuj zamówienia menu od gości i z sali.",
      caps: [
        "Zobacz otwarte i zakończone zamówienia.",
        "Aktualizuj status, gdy kuchnia i bar przygotowują pozycje.",
        "Przeglądaj sumy trafiające do finansów.",
      ],
    },
    finance: {
      title: "Finanse",
      description:
        "Przegląd przychodów, księga transakcji, straty i raporty — nie tu prowadzisz kuchnię ani salę.",
      caps: [
        "Zobacz łączne przychody z menu, gry i rezerwacji (zestawienia tylko do odczytu).",
        "Rejestruj szybką sprzedaż przy ladzie i śledź straty.",
        "Raporty 1–90 dni z wykresami, drukiem i eksportem CSV.",
        "Zamówienia menu i rozliczenia gier zostają w Operacjach; rezerwacje w Rezerwacjach.",
      ],
    },
    staff: {
      title: "Konta pracowników",
      description: "Zapraszaj personel, przypisuj role i zarządzaj dostępem do panelu.",
      caps: [
        "Twórz loginy pracowników w limicie miejsc.",
        "Przypisuj uprawnienia według roli.",
        "Wyłącz dostęp, gdy ktoś opuszcza zespół.",
      ],
    },
    resources: {
      title: "Strefa gier",
      description: "Stanowiska, tory, stawki i konfiguracja oferty.",
      caps: [
        "Twórz kategorie PC, konsol, kręgli i innych.",
        "Ustaw stawki widoczne przy rezerwacji.",
        "Zarządzaj liczbą dostępnych jednostek.",
      ],
    },
    dining: {
      title: "Układ sali",
      description: "Stoliki, piętra i układ miejsc na rezerwacje i obsługę.",
      caps: [
        "Organizuj stoliki według piętra lub strefy.",
        "Ustaw pojemność pod rezerwacje według liczby osób.",
        "Utrzymuj plan sali zgodny z rzeczywistością.",
      ],
    },
    messages: {
      title: "Wiadomości gości",
      description: "Czat i wiadomości z formularza kontaktowego ze strony publicznej.",
      caps: [
        "Odpowiadaj na żywy czat gości.",
        "Przeglądaj zgłoszenia z formularza kontaktowego.",
        "Trzymaj rozmowy z gośćmi w jednej skrzynce.",
      ],
    },
  },
};

/** German / French / Spanish / Arabic: override high-traffic UI; fall back to English */
const de: DictTree = {
  ...en,
  financeHub: {
    overview: "Übersicht",
    transactions: "Transaktionen",
    invoices: "Rechnungen",
    losses: "Verluste",
    reports: "Berichte",
  },
  nav: pl.nav && en.nav ? {
    group: {
      overview: "Übersicht",
      venue: "Venue",
      operations: "Betrieb",
      finance: "Finanzen",
      team: "Team",
    },
    overview: "Übersicht",
    subscription: "Abo & Plan",
    notifications: "Benachrichtigungen",
    audit: "Audit-Protokoll",
    reviews: "Bewertungen",
    settings: "Shop-Einstellungen",
    messages: "Gästenachrichten",
    menu: "Speisekarte",
    gallery: "Galerie",
    hours: "Öffnungszeiten",
    notes: "Schichtnotizen",
    gaming: "Gaming-Setup",
    dining: "Gastronomie-Layout",
    sessions: "Reservierungen",
    orders: "Menübestellungen",
    playBilling: "Spielabrechnung",
    finance: "Finanzen",
    staff: "Mitarbeiterkonten",
  } : en.nav,
  common: {
    ...(en.common as DictTree),
    save: "Speichern",
    cancel: "Abbrechen",
    loading: "Laden…",
    error: "Etwas ist schiefgelaufen.",
    convert: "Umrechnen",
    amount: "Betrag",
    from: "Von",
    to: "Nach",
    add: "Hinzufügen",
    edit: "Bearbeiten",
    remove: "Entfernen",
    preview: "Vorschau",
    phone: "Telefon",
    email: "E-Mail",
    date: "Datum",
    opens: "Öffnet",
    closes: "Schließt",
    saving: "Speichern…",
    saved: "Gespeichert",
    willSave: "Wird gespeichert…",
    allSaved: "Alle Änderungen gespeichert",
    whatYouCanDo: "Was Sie hier tun können",
    aboutSection: "Über diesen Bereich",
    viewOnly: "Nur Ansicht — bitten Sie Ihren Admin um Bearbeitungszugriff.",
  },
  subscription: deLocaleBlocks.subscription,
  pack: deLocaleBlocks.pack,
  addon: deLocaleBlocks.addon,
  featureGate: deLocaleBlocks.featureGate,
  settings: {
    ...(en.settings as DictTree),
    regional: "Regionale Einstellungen",
    language: "Dashboard-Sprache",
    currency: "Währung der Venue",
    currencyHint:
      "Alle neuen Menü- und Spielpreise werden in {currency} erfasst und angezeigt. Vorschau: {preview}",
    currencyConvertHint:
      "Ein Währungswechsel rechnet den aktuellen Katalog mit Live-Kursen um (bezahlte Bestellungen behalten Beträge).",
    currencyConfirm:
      "Alle Menü- und Spielpreise von {from} nach {to} mit Live-Wechselkursen umrechnen?\n\nVergangene Bestellungen bleiben unverändert. Neue Preise sind in {to}.",
    catalogConverted:
      "Katalog umgerechnet {from} → {to} zum Kurs {rate} ({menu} Menü · {rates} Tarife · live {when}).",
    converter: "Währungsrechner",
    multiTargets: "Mehrere Zielwährungen",
    visibility: "Sichtbarkeit",
    publishPage: "Öffentliche Seite veröffentlichen",
    publishPageHint:
      "Aktiviert Ihre Gästeseite unter /venue/{slug}. Gäste brauchen diesen Link (oder das Verzeichnis).",
    listDirectory: "Im Venue-Verzeichnis listen",
    listDirectoryHint:
      "Zeigt Ihre Venue unter /venues. Aus = Seite bleibt live, aber nicht im Verzeichnis.",
    publishLocked: "Erfordert das Add-on Venue-Seite & Entdeckung.",
    listLocked: "Venue-Seite & Entdeckung freischalten, um im Verzeichnis zu erscheinen.",
    publicUrl: "Öffentliche URL:",
    identity: "Venue-Identität",
    identityHint:
      "Der interne Name erscheint in der Seitenleiste. Der Anzeigename ist, was Gäste im Marketing und auf der öffentlichen Seite sehen.",
    dashboardName: "Dashboard-Venue-Name",
    marketingName: "Marketing-Anzeigename",
    marketingPlaceholder: "Gleich wie Venue-Name",
    shortDescription: "Kurzbeschreibung",
    location: "Standort & Kontakt",
    street: "Straße und Hausnummer",
    city: "Stadt",
    country: "Land",
    reviewsTitle: "Gästebewertungen",
    reviewsHint:
      "Gilt für Venue-Bewertungen auf Ihrer öffentlichen Seite. Personal veröffentlicht freigegebene Bewertungen im Bewertungs-Dashboard.",
    reviewsOn: "An — annehmen; Personal veröffentlicht",
    reviewsOnHint:
      "Gäste können bewerten; Bewertungen erscheinen öffentlich, nachdem Sie sie freigeben.",
    reviewsHidden: "Versteckt — annehmen, aber nicht zeigen",
    reviewsHiddenHint:
      "Gäste können weiter einreichen; Sie werden benachrichtigt, aber Bewertungen bleiben öffentlich unsichtbar.",
    reviewsOff: "Aus — keine Bewertungen",
    reviewsOffHint: "Niemand kann Bewertungen für diese Venue hinterlassen.",
    categories: "Venue-Kategorien",
    categoriesHint:
      "So finden Spieler Sie unter /venues. Wählen Sie Vorgaben oder fügen Sie eigene hinzu.",
    categoriesPlaceholder: "Eigene Kategorie (z. B. Dachterrasse)",
    reloadOverlay: "Venue-Name im Dashboard wird aktualisiert…",
    conversionFailed: "Umrechnung fehlgeschlagen.",
  },
  hours: {
    ...(en.hours as DictTree),
    weekly: "Wöchentliche Öffnungszeiten",
    weeklyHint: "Reguläre Öffnungszeiten, die Gäste auf Ihrer Venue-Seite sehen.",
    closed: "Geschlossen",
    noService: "Kein Betrieb",
    saveWeekly: "Wöchentliche Zeiten speichern",
    exceptions: "Schließungen & Sondertage",
    exceptionsHint:
      "Private Events, Feiertage oder andere Zeiten an einem bestimmten Datum.",
    noteOptional: "Notiz (optional)",
    notePlaceholder: "z. B. Betriebsfeier, Wartung",
    closedAllDay: "Ganztägig geschlossen",
    addDate: "Datum hinzufügen",
    noExceptions: "Keine bevorstehenden Ausnahmen.",
    specialHours: "Sonderzeiten",
    editException: "Ausnahme bearbeiten",
    saveChanges: "Änderungen speichern",
    viewOnly: "Nur Ansicht — bitten Sie Ihren Admin um Bearbeitungszugriff für Zeiten.",
    day: {
      "0": "Sonntag",
      "1": "Montag",
      "2": "Dienstag",
      "3": "Mittwoch",
      "4": "Donnerstag",
      "5": "Freitag",
      "6": "Samstag",
    },
  },
  guide: {
    whatYouCanDo: "Was Sie hier tun können",
    settings: {
      title: "Shop-Einstellungen",
      description:
        "Venue-Profil, Marketingname, Adresse, Veröffentlichung und regionale Einstellungen. Änderungen speichern automatisch nach 2 Sekunden.",
      caps: [
        "Dashboard- und kundenorientierten Namen festlegen.",
        "Adresse, Stadt, Land, Telefon und E-Mail hinzufügen.",
        "Venue auf der Marketing-Browse-Seite veröffentlichen.",
        "Dashboard-Sprache und Venue-Währung einstellen.",
        "Währungsrechner für Multi-Währungsplanung nutzen.",
      ],
    },
    hours: {
      title: "Öffnungszeiten",
      description:
        "Wöchentliche Öffnungszeiten sowie einmalige Schließungen oder Sonderzeiten für Events und Feiertage.",
      caps: [
        "Öffnungs-/Schließzeiten für jeden Wochentag setzen.",
        "Regelmäßige Ruhetage markieren (z. B. Sonntag).",
        "Schließdaten oder Sonderzeiten für private Events hinzufügen.",
      ],
    },
    overview: deLocaleBlocks.guide.overview as DictTree,
    gallery: deLocaleBlocks.guide.gallery as DictTree,
    menu: deLocaleBlocks.guide.menu as DictTree,
    notes: deLocaleBlocks.guide.notes as DictTree,
    reviews: deLocaleBlocks.guide.reviews as DictTree,
    notifications: deLocaleBlocks.guide.notifications as DictTree,
    audit: deLocaleBlocks.guide.audit as DictTree,
    subscription: deLocaleBlocks.guide.subscription as DictTree,
    playBilling: deLocaleBlocks.guide.playBilling as DictTree,
    sessions: deLocaleBlocks.guide.sessions as DictTree,
    orders: deLocaleBlocks.guide.orders as DictTree,
    finance: deLocaleBlocks.guide.finance as DictTree,
    staff: deLocaleBlocks.guide.staff as DictTree,
    resources: deLocaleBlocks.guide.resources as DictTree,
    dining: deLocaleBlocks.guide.dining as DictTree,
    messages: deLocaleBlocks.guide.messages as DictTree,
  },
};

const fr: DictTree = {
  ...en,
  financeHub: {
    overview: "Aperçu",
    transactions: "Transactions",
    invoices: "Factures",
    losses: "Pertes",
    reports: "Rapports",
  },
  nav: {
    group: {
      overview: "Aperçu",
      venue: "Établissement",
      operations: "Opérations",
      finance: "Finances",
      team: "Équipe",
    },
    overview: "Aperçu",
    subscription: "Abonnement et formule",
    notifications: "Notifications",
    audit: "Journal d’audit",
    reviews: "Avis",
    settings: "Paramètres du lieu",
    messages: "Messages des clients",
    menu: "Menu",
    gallery: "Galerie",
    hours: "Horaires",
    notes: "Notes de service",
    gaming: "Espace jeux",
    dining: "Plan de salle",
    sessions: "Réservations",
    orders: "Commandes menu",
    playBilling: "Facturation jeux",
    finance: "Finances",
    staff: "Comptes employés",
  },
  common: {
    ...(en.common as DictTree),
    save: "Enregistrer",
    cancel: "Annuler",
    loading: "Chargement…",
    error: "Une erreur s’est produite.",
    convert: "Convertir",
    amount: "Montant",
    from: "De",
    to: "Vers",
    add: "Ajouter",
    edit: "Modifier",
    remove: "Supprimer",
    preview: "Aperçu",
    phone: "Téléphone",
    email: "E-mail",
    date: "Date",
    opens: "Ouverture",
    closes: "Fermeture",
    saving: "Enregistrement…",
    saved: "Enregistré",
    willSave: "Enregistrement bientôt…",
    allSaved: "Toutes les modifications enregistrées",
    whatYouCanDo: "Ce que vous pouvez faire ici",
    aboutSection: "À propos de cette section",
    viewOnly: "Lecture seule — demandez l’accès en écriture à votre admin.",
  },
  subscription: frLocaleBlocks.subscription,
  pack: frLocaleBlocks.pack,
  addon: frLocaleBlocks.addon,
  featureGate: frLocaleBlocks.featureGate,
  settings: {
    ...(en.settings as DictTree),
    regional: "Préférences régionales",
    language: "Langue du tableau de bord",
    currency: "Devise du lieu",
    currencyHint:
      "Tous les nouveaux prix du menu et des jeux sont saisis et affichés en {currency}. Aperçu : {preview}",
    currencyConvertHint:
      "Changer de devise convertit le catalogue actuel avec des taux en direct (les commandes payées gardent leurs montants).",
    currencyConfirm:
      "Convertir tous les prix du menu et des jeux de {from} vers {to} avec les taux du marché en direct ?\n\nLes commandes passées restent inchangées. Les nouveaux prix seront en {to}.",
    catalogConverted:
      "Catalogue converti {from} → {to} au taux {rate} ({menu} menu · {rates} tarifs · en direct {when}).",
    converter: "Convertisseur de devises",
    multiTargets: "Plusieurs devises cibles",
    visibility: "Visibilité",
    publishPage: "Publier la page publique",
    publishPageHint:
      "Active votre page invité sur /venue/{slug}. Les clients ont besoin de ce lien (ou de l’annuaire).",
    listDirectory: "Afficher dans l’annuaire",
    listDirectoryHint:
      "Affiche votre lieu dans /venues. Désactivé = page active, hors annuaire.",
    publishLocked: "Nécessite l’add-on Page du lieu et découverte.",
    listLocked: "Débloquez Page du lieu et découverte pour apparaître dans l’annuaire.",
    publicUrl: "URL publique :",
    identity: "Identité du lieu",
    identityHint:
      "Le nom interne apparaît dans la barre latérale. Le nom d’affichage est ce que voient les clients en marketing et sur la page publique.",
    dashboardName: "Nom du lieu (tableau de bord)",
    marketingName: "Nom marketing",
    marketingPlaceholder: "Identique au nom du lieu",
    shortDescription: "Courte description",
    location: "Localisation et contact",
    street: "Adresse",
    city: "Ville",
    country: "Pays",
    reviewsTitle: "Avis des clients",
    reviewsHint:
      "Concerne les avis laissés sur votre page publique. Le personnel publie les avis approuvés depuis le tableau Avis.",
    reviewsOn: "Activé — accepter ; le personnel publie",
    reviewsOnHint:
      "Les clients peuvent laisser des avis ; les notes apparaissent publiquement après publication.",
    reviewsHidden: "Masqué — accepter sans afficher",
    reviewsHiddenHint:
      "Les clients peuvent encore envoyer ; vous êtes notifié, mais les notes restent hors page publique.",
    reviewsOff: "Désactivé — aucun avis",
    reviewsOffHint: "Personne ne peut laisser d’avis sur ce lieu.",
    categories: "Catégories du lieu",
    categoriesHint:
      "Comment les joueurs vous trouvent sur /venues. Choisissez des modèles ou ajoutez les vôtres.",
    categoriesPlaceholder: "Catégorie personnalisée (ex. Terrasse rooftop)",
    reloadOverlay: "Mise à jour du nom du lieu dans le tableau de bord…",
    conversionFailed: "Échec de la conversion.",
  },
  hours: {
    ...(en.hours as DictTree),
    weekly: "Horaires hebdomadaires",
    weeklyHint: "Horaires d’ouverture réguliers visibles sur votre page.",
    closed: "Fermé",
    noService: "Pas de service",
    saveWeekly: "Enregistrer les horaires hebdomadaires",
    exceptions: "Fermetures et jours spéciaux",
    exceptionsHint:
      "Événements privés, jours fériés ou horaires différents à une date donnée.",
    noteOptional: "Note (optionnel)",
    notePlaceholder: "ex. Fête du personnel, maintenance",
    closedAllDay: "Fermé toute la journée",
    addDate: "Ajouter une date",
    noExceptions: "Aucune exception à venir.",
    specialHours: "Horaires spéciaux",
    editException: "Modifier l’exception",
    saveChanges: "Enregistrer les modifications",
    viewOnly: "Lecture seule — demandez l’accès pour modifier les horaires.",
    day: {
      "0": "Dimanche",
      "1": "Lundi",
      "2": "Mardi",
      "3": "Mercredi",
      "4": "Jeudi",
      "5": "Vendredi",
      "6": "Samedi",
    },
  },
  guide: {
    whatYouCanDo: "Ce que vous pouvez faire ici",
    settings: {
      title: "Paramètres du lieu",
      description:
        "Profil, nom marketing, adresse, publication et préférences régionales. Enregistrement automatique après 2 secondes.",
      caps: [
        "Définir le nom interne et le nom visible des clients.",
        "Ajouter adresse, ville, pays, téléphone et e-mail.",
        "Publier votre lieu sur la page d’annuaire.",
        "Régler la langue du tableau de bord et la devise.",
        "Utiliser le convertisseur de devises.",
      ],
    },
    hours: {
      title: "Horaires",
      description:
        "Horaires hebdomadaires et fermetures ponctuelles ou horaires spéciaux pour événements et jours fériés.",
      caps: [
        "Définir ouverture/fermeture pour chaque jour.",
        "Marquer les jours de fermeture réguliers.",
        "Ajouter des dates de fermeture ou horaires spéciaux.",
      ],
    },
    overview: frLocaleBlocks.guide.overview as DictTree,
    gallery: frLocaleBlocks.guide.gallery as DictTree,
    menu: frLocaleBlocks.guide.menu as DictTree,
    notes: frLocaleBlocks.guide.notes as DictTree,
    reviews: frLocaleBlocks.guide.reviews as DictTree,
    notifications: frLocaleBlocks.guide.notifications as DictTree,
    audit: frLocaleBlocks.guide.audit as DictTree,
    subscription: frLocaleBlocks.guide.subscription as DictTree,
    playBilling: frLocaleBlocks.guide.playBilling as DictTree,
    sessions: frLocaleBlocks.guide.sessions as DictTree,
    orders: frLocaleBlocks.guide.orders as DictTree,
    finance: frLocaleBlocks.guide.finance as DictTree,
    staff: frLocaleBlocks.guide.staff as DictTree,
    resources: frLocaleBlocks.guide.resources as DictTree,
    dining: frLocaleBlocks.guide.dining as DictTree,
    messages: frLocaleBlocks.guide.messages as DictTree,
  },
};

const es: DictTree = {
  ...en,
  financeHub: {
    overview: "Resumen",
    transactions: "Transacciones",
    invoices: "Facturas",
    losses: "Pérdidas",
    reports: "Informes",
  },
  nav: {
    group: {
      overview: "Resumen",
      venue: "Local",
      operations: "Operaciones",
      finance: "Finanzas",
      team: "Equipo",
    },
    overview: "Resumen",
    subscription: "Suscripción y plan",
    notifications: "Notificaciones",
    audit: "Registro de auditoría",
    reviews: "Reseñas",
    settings: "Ajustes del local",
    messages: "Mensajes de invitados",
    menu: "Carta",
    gallery: "Galería",
    hours: "Horario",
    notes: "Notas de turno",
    gaming: "Zona de juegos",
    dining: "Distribución del salón",
    sessions: "Reservas",
    orders: "Pedidos del menú",
    playBilling: "Facturación de juegos",
    finance: "Finanzas",
    staff: "Cuentas de empleados",
  },
  common: {
    ...(en.common as DictTree),
    save: "Guardar",
    cancel: "Cancelar",
    loading: "Cargando…",
    error: "Algo salió mal.",
    convert: "Convertir",
    amount: "Importe",
    from: "De",
    to: "A",
    add: "Añadir",
    edit: "Editar",
    remove: "Eliminar",
    preview: "Vista previa",
    phone: "Teléfono",
    email: "Correo",
    date: "Fecha",
    opens: "Abre",
    closes: "Cierra",
    saving: "Guardando…",
    saved: "Guardado",
    willSave: "Se guardará…",
    allSaved: "Todos los cambios guardados",
    whatYouCanDo: "Qué puedes hacer aquí",
    aboutSection: "Sobre esta sección",
    viewOnly: "Solo lectura — pide a tu admin acceso de edición.",
  },
  subscription: esLocaleBlocks.subscription,
  pack: esLocaleBlocks.pack,
  addon: esLocaleBlocks.addon,
  featureGate: esLocaleBlocks.featureGate,
  settings: {
    ...(en.settings as DictTree),
    regional: "Preferencias regionales",
    language: "Idioma del panel",
    currency: "Moneda del local",
    currencyHint:
      "Todos los precios nuevos de menú y juegos se introducen y muestran en {currency}. Vista previa: {preview}",
    currencyConvertHint:
      "Cambiar la moneda convierte el catálogo actual con tipos de cambio en vivo (los pedidos pagados conservan importes).",
    currencyConfirm:
      "¿Convertir todos los precios de menú y juegos de {from} a {to} con tipos de cambio en vivo?\n\nLos pedidos anteriores se mantienen. Los precios nuevos estarán en {to}.",
    catalogConverted:
      "Catálogo convertido {from} → {to} a {rate} ({menu} menú · {rates} tarifas · en vivo {when}).",
    converter: "Conversor de moneda",
    multiTargets: "Varias monedas destino",
    visibility: "Visibilidad",
    publishPage: "Publicar página pública",
    publishPageHint:
      "Activa tu página de invitados en /venue/{slug}. Los clientes necesitan este enlace (o el directorio).",
    listDirectory: "Listar en el directorio",
    listDirectoryHint:
      "Muestra tu local en /venues. Desactivado = página activa, fuera del directorio.",
    publishLocked: "Requiere el complemento Página del local y descubrimiento.",
    listLocked: "Desbloquea Página del local y descubrimiento para aparecer en el directorio.",
    publicUrl: "URL pública:",
    identity: "Identidad del local",
    identityHint:
      "El nombre interno aparece en la barra lateral. El nombre público es lo que ven los clientes en marketing y en la página pública.",
    dashboardName: "Nombre del local (panel)",
    marketingName: "Nombre de marketing",
    marketingPlaceholder: "Igual que el nombre del local",
    shortDescription: "Descripción breve",
    location: "Ubicación y contacto",
    street: "Dirección",
    city: "Ciudad",
    country: "País",
    reviewsTitle: "Reseñas de invitados",
    reviewsHint:
      "Aplica a las reseñas del local en tu página pública. El personal publica las aprobadas desde Reseñas.",
    reviewsOn: "Activado — aceptar; el personal publica",
    reviewsOnHint:
      "Los invitados pueden dejar reseñas; las valoraciones aparecen públicamente tras publicarlas.",
    reviewsHidden: "Oculto — aceptar pero no mostrar",
    reviewsHiddenHint:
      "Los invitados pueden enviar; te notificamos, pero las valoraciones no se muestran públicamente.",
    reviewsOff: "Desactivado — sin reseñas",
    reviewsOffHint: "Nadie puede dejar reseñas en este local.",
    categories: "Categorías del local",
    categoriesHint:
      "Cómo te encuentran en /venues. Elige preajustes o añade los tuyos.",
    categoriesPlaceholder: "Categoría personalizada (p. ej. Terraza)",
    reloadOverlay: "Actualizando el nombre del local en el panel…",
    conversionFailed: "Error en la conversión.",
  },
  hours: {
    ...(en.hours as DictTree),
    weekly: "Horario semanal",
    weeklyHint: "Horario habitual que ven los invitados en tu página.",
    closed: "Cerrado",
    noService: "Sin servicio",
    saveWeekly: "Guardar horario semanal",
    exceptions: "Cierres y días especiales",
    exceptionsHint:
      "Eventos privados, festivos u otros horarios en una fecha concreta.",
    noteOptional: "Nota (opcional)",
    notePlaceholder: "p. ej. Fiesta del personal, mantenimiento",
    closedAllDay: "Cerrado todo el día",
    addDate: "Añadir fecha",
    noExceptions: "No hay excepciones próximas.",
    specialHours: "Horario especial",
    editException: "Editar excepción",
    saveChanges: "Guardar cambios",
    viewOnly: "Solo lectura — pide acceso para editar horarios.",
    day: {
      "0": "Domingo",
      "1": "Lunes",
      "2": "Martes",
      "3": "Miércoles",
      "4": "Jueves",
      "5": "Viernes",
      "6": "Sábado",
    },
  },
  guide: {
    whatYouCanDo: "Qué puedes hacer aquí",
    settings: {
      title: "Ajustes del local",
      description:
        "Perfil, nombre de marketing, dirección, publicación y preferencias regionales. Los cambios se guardan solos tras 2 segundos.",
      caps: [
        "Definir nombre interno y nombre visible para clientes.",
        "Añadir dirección, ciudad, país, teléfono y correo.",
        "Publicar el local en el directorio.",
        "Configurar idioma del panel y moneda.",
        "Usar el conversor de moneda.",
      ],
    },
    hours: {
      title: "Horario",
      description:
        "Horario semanal y cierres o horarios especiales para eventos y festivos.",
      caps: [
        "Definir apertura/cierre de cada día.",
        "Marcar días de cierre habituales.",
        "Añadir fechas de cierre u horarios especiales.",
      ],
    },
    overview: esLocaleBlocks.guide.overview as DictTree,
    gallery: esLocaleBlocks.guide.gallery as DictTree,
    menu: esLocaleBlocks.guide.menu as DictTree,
    notes: esLocaleBlocks.guide.notes as DictTree,
    reviews: esLocaleBlocks.guide.reviews as DictTree,
    notifications: esLocaleBlocks.guide.notifications as DictTree,
    audit: esLocaleBlocks.guide.audit as DictTree,
    subscription: esLocaleBlocks.guide.subscription as DictTree,
    playBilling: esLocaleBlocks.guide.playBilling as DictTree,
    sessions: esLocaleBlocks.guide.sessions as DictTree,
    orders: esLocaleBlocks.guide.orders as DictTree,
    finance: esLocaleBlocks.guide.finance as DictTree,
    staff: esLocaleBlocks.guide.staff as DictTree,
    resources: esLocaleBlocks.guide.resources as DictTree,
    dining: esLocaleBlocks.guide.dining as DictTree,
    messages: esLocaleBlocks.guide.messages as DictTree,
  },
};

const ar: DictTree = {
  ...en,
  financeHub: {
    overview: "نظرة عامة",
    transactions: "المعاملات",
    invoices: "الفواتير",
    losses: "الخسائر",
    reports: "التقارير",
  },
  nav: {
    group: {
      overview: "نظرة عامة",
      venue: "المكان",
      operations: "التشغيل",
      finance: "المالية",
      team: "الفريق",
    },
    overview: "نظرة عامة",
    subscription: "الاشتراك والخطة",
    notifications: "الإشعارات",
    audit: "سجل التدقيق",
    reviews: "المراجعات",
    settings: "إعدادات المحل",
    messages: "رسائل الضيوف",
    menu: "القائمة",
    gallery: "المعرض",
    hours: "ساعات العمل",
    notes: "ملاحظات الوردية",
    gaming: "إعداد الألعاب",
    dining: "تخطيط الصالة",
    sessions: "الحجوزات",
    orders: "طلبات القائمة",
    playBilling: "فوترة الألعاب",
    finance: "المالية",
    staff: "حسابات الموظفين",
  },
  common: {
    ...(en.common as DictTree),
    save: "حفظ",
    cancel: "إلغاء",
    loading: "جارٍ التحميل…",
    error: "حدث خطأ ما.",
    convert: "تحويل",
    amount: "المبلغ",
    from: "من",
    to: "إلى",
    add: "إضافة",
    edit: "تعديل",
    remove: "إزالة",
    preview: "معاينة",
    phone: "الهاتف",
    email: "البريد",
    date: "التاريخ",
    opens: "يفتح",
    closes: "يغلق",
    saving: "جارٍ الحفظ…",
    saved: "تم الحفظ",
    willSave: "سيتم الحفظ…",
    allSaved: "تم حفظ جميع التغييرات",
    whatYouCanDo: "ما يمكنك فعله هنا",
    aboutSection: "حول هذا القسم",
    viewOnly: "للعرض فقط — اطلب من المسؤول صلاحية التعديل.",
  },
  subscription: arLocaleBlocks.subscription,
  pack: arLocaleBlocks.pack,
  addon: arLocaleBlocks.addon,
  featureGate: arLocaleBlocks.featureGate,
  settings: {
    ...(en.settings as DictTree),
    regional: "التفضيلات الإقليمية",
    language: "لغة لوحة التحكم",
    currency: "عملة المكان",
    currencyHint:
      "جميع أسعار القائمة والألعاب الجديدة تُدخل وتُعرض بـ {currency}. معاينة: {preview}",
    currencyConvertHint:
      "تغيير العملة يحوّل الكتالوج الحالي بأسعار السوق الحية (الطلبات المدفوعة تحتفظ بمبالغها).",
    currencyConfirm:
      "تحويل جميع أسعار القائمة والألعاب من {from} إلى {to} بأسعار الصرف الحية؟\n\nالطلبات السابقة تبقى كما هي. الأسعار الجديدة ستكون بـ {to}.",
    catalogConverted:
      "تم تحويل الكتالوج {from} → {to} بسعر {rate} ({menu} قائمة · {rates} أسعار · مباشر {when}).",
    converter: "محول العملات",
    multiTargets: "عملات مستهدفة متعددة",
    visibility: "الظهور",
    publishPage: "نشر الصفحة العامة",
    publishPageHint:
      "يفعّل صفحة الزوار على /venue/{slug}. يحتاج الضيوف هذا الرابط (أو الدليل) للعثور عليك.",
    listDirectory: "الإدراج في دليل الأماكن",
    listDirectoryHint:
      "يظهر مكانك في /venues. متوقف = الصفحة تعمل لكنها مخفية عن الدليل.",
    publishLocked: "يتطلب إضافة صفحة المكان والاكتشاف.",
    listLocked: "فعّل صفحة المكان والاكتشاف للظهور في الدليل.",
    publicUrl: "الرابط العام:",
    identity: "هوية المكان",
    identityHint:
      "الاسم الداخلي يظهر في الشريط الجانبي. اسم العرض هو ما يراه الزوار في التسويق والصفحة العامة.",
    dashboardName: "اسم المكان في اللوحة",
    marketingName: "اسم التسويق",
    marketingPlaceholder: "نفس اسم المكان",
    shortDescription: "وصف قصير",
    location: "الموقع والتواصل",
    street: "العنوان",
    city: "المدينة",
    country: "البلد",
    reviewsTitle: "مراجعات الضيوف",
    reviewsHint:
      "ينطبق على مراجعات المكان في صفحتك العامة. ينشر الموظفون المراجعات المعتمدة من لوحة المراجعات.",
    reviewsOn: "مفعّل — قبول؛ الموظفون ينشرون",
    reviewsOnHint:
      "يمكن للضيوف ترك مراجعات؛ تظهر التقييمات علنًا بعد نشرها.",
    reviewsHidden: "مخفي — قبول دون عرض",
    reviewsHiddenHint:
      "يمكن للضيوف الإرسال؛ تصلك إشعارات، لكن التقييمات تبقى مخفية عن العامة.",
    reviewsOff: "متوقف — بدون مراجعات",
    reviewsOffHint: "لا يمكن لأحد ترك مراجعات لهذا المكان.",
    categories: "فئات المكان",
    categoriesHint:
      "كيف يجدك الزوار على /venues. اختر قوالب أو أضف فئاتك.",
    categoriesPlaceholder: "فئة مخصصة (مثل شرفة سطح)",
    reloadOverlay: "جاري تحديث اسم المكان في لوحة التحكم…",
    conversionFailed: "فشل التحويل.",
  },
  hours: {
    ...(en.hours as DictTree),
    weekly: "ساعات الأسبوع",
    weeklyHint: "أوقات الفتح المعتادة التي يراها الضيوف على صفحتك.",
    closed: "مغلق",
    noService: "لا خدمة",
    saveWeekly: "حفظ ساعات الأسبوع",
    exceptions: "الإغلاقات والأيام الخاصة",
    exceptionsHint: "فعاليات خاصة أو عطل أو ساعات مختلفة في تاريخ محدد.",
    noteOptional: "ملاحظة (اختياري)",
    notePlaceholder: "مثل حفلة الموظفين، صيانة",
    closedAllDay: "مغلق طوال اليوم",
    addDate: "إضافة تاريخ",
    noExceptions: "لا استثناءات قادمة.",
    specialHours: "ساعات خاصة",
    editException: "تعديل الاستثناء",
    saveChanges: "حفظ التغييرات",
    viewOnly: "للعرض فقط — اطلب صلاحية تعديل الساعات.",
    day: {
      "0": "الأحد",
      "1": "الإثنين",
      "2": "الثلاثاء",
      "3": "الأربعاء",
      "4": "الخميس",
      "5": "الجمعة",
      "6": "السبت",
    },
  },
  guide: {
    whatYouCanDo: "ما يمكنك فعله هنا",
    settings: {
      title: "إعدادات المحل",
      description:
        "الملف الشخصي واسم التسويق والعنوان والنشر والتفضيلات الإقليمية. تُحفظ التعديلات تلقائيًا بعد ثانيتين.",
      caps: [
        "تعيين اسم اللوحة واسم العرض للعملاء.",
        "إضافة العنوان والمدينة والبلد والهاتف والبريد.",
        "نشر مكانك في صفحة الدليل.",
        "تعيين لغة اللوحة وعملة المكان.",
        "استخدام محول العملات.",
      ],
    },
    hours: {
      title: "ساعات العمل",
      description:
        "ساعات الأسبوع وإغلاقات أو ساعات خاصة للفعاليات والعطل.",
      caps: [
        "تعيين أوقات الفتح/الإغلاق لكل يوم.",
        "تحديد أيام الإغلاق المنتظمة.",
        "إضافة تواريخ إغلاق أو ساعات خاصة.",
      ],
    },
    overview: arLocaleBlocks.guide.overview as DictTree,
    gallery: arLocaleBlocks.guide.gallery as DictTree,
    menu: arLocaleBlocks.guide.menu as DictTree,
    notes: arLocaleBlocks.guide.notes as DictTree,
    reviews: arLocaleBlocks.guide.reviews as DictTree,
    notifications: arLocaleBlocks.guide.notifications as DictTree,
    audit: arLocaleBlocks.guide.audit as DictTree,
    subscription: arLocaleBlocks.guide.subscription as DictTree,
    playBilling: arLocaleBlocks.guide.playBilling as DictTree,
    sessions: arLocaleBlocks.guide.sessions as DictTree,
    orders: arLocaleBlocks.guide.orders as DictTree,
    finance: arLocaleBlocks.guide.finance as DictTree,
    staff: arLocaleBlocks.guide.staff as DictTree,
    resources: arLocaleBlocks.guide.resources as DictTree,
    dining: arLocaleBlocks.guide.dining as DictTree,
    messages: arLocaleBlocks.guide.messages as DictTree,
  },
};

const catalogs: Record<SupportedLocale, DictTree> = {
  en,
  pl,
  de,
  fr,
  es,
  ar,
};

/** Dot-path message key, e.g. "settings.location" or "nav.group.overview" */
export type MessageKey = string;

export function translate(
  locale: string,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const code =
    (locale as SupportedLocale) in catalogs
      ? (locale as SupportedLocale)
      : "en";
  const raw =
    getPath(catalogs[code], key) ?? getPath(catalogs.en, key) ?? key;
  let out = typeof raw === "string" ? raw : key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.replaceAll(`{${k}}`, String(v));
    }
  }
  return out;
}

export function translateList(locale: string, key: MessageKey): string[] {
  const code =
    (locale as SupportedLocale) in catalogs
      ? (locale as SupportedLocale)
      : "en";
  const raw = getPath(catalogs[code], key) ?? getPath(catalogs.en, key);
  return Array.isArray(raw) ? raw.map(String) : [];
}

export function isRtlLocale(locale: string) {
  return locale === "ar";
}

export type GuideSection =
  | "overview"
  | "settings"
  | "gallery"
  | "notifications"
  | "audit"
  | "reviews"
  | "subscription"
  | "menu"
  | "hours"
  | "notes"
  | "playBilling"
  | "sessions"
  | "orders"
  | "finance"
  | "staff"
  | "resources"
  | "dining"
  | "messages";

export function translateGuide(locale: string, section: GuideSection) {
  return {
    title: translate(locale, `guide.${section}.title`),
    description: translate(locale, `guide.${section}.description`),
    capabilities: translateList(locale, `guide.${section}.caps`),
  };
}
