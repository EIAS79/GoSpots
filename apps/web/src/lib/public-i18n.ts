import type { PublicLocale } from "./public-prefs";

type Dict = Record<string, string>;

const en: Dict = {
  "nav.explore": "Explore",
  "nav.how": "How it works",
  "nav.faq": "FAQ",
  "nav.features": "Features",
  "nav.pricing": "Pricing",
  "nav.signIn": "Sign in",
  "nav.listVenue": "List your venue",
  "nav.listVenueShort": "List venue",
  "nav.iOwnVenue": "I own a venue",
  "nav.allVenues": "All venues",
  "nav.language": "Language",
  "nav.currency": "Currency",

  "hero.manage.badge": "Venue operations · private beta",
  "hero.manage.titleA": "Run the floor",
  "hero.manage.titleB": "from one live screen.",
  "hero.manage.subtitle":
    "Sessions, reservations, billing, and staff control — built for billiard halls, gaming lounges, and busy entertainment floors. We're onboarding operators first while the public directory grows.",
  "hero.manage.ctaPrimary": "List your venue — free trial",
  "hero.manage.ctaSecondary": "Sign in",
  "hero.manage.pillar1": "Live table & console status",
  "hero.manage.pillar2": "Timers, tabs, and handovers without guesswork",
  "hero.manage.pillar3": "Honest beta — onboarding venues first",

  "hero.play.badge": "Discover & reserve",
  "hero.play.titleA": "Find your next",
  "hero.play.titleB": "favorite spot.",
  "hero.play.subtitle":
    "Billiard halls, gaming lounges, restaurants, cafés, bars, and karaoke rooms — search by city and category, then reserve when the venue enables it.",
  "hero.play.ctaPrimary": "Browse venues",
  "hero.play.ctaSecondary": "I run a venue",
  "hero.play.pillar1": "From billiards to brunch — one directory",
  "hero.play.pillar2": "Filter by city, category, and vibe",
  "hero.play.pillar3": "Reserve when the venue enables it",

  "venues.worldwide": "Worldwide venues",
  "venues.published": "{total} published venues · {countries} countries",
  "venues.publishedOne": "{total} published venue · {countries} countries",
  "venues.tagline": "Find your next spot",
  "venues.subtitle":
    "Gaming lounges, billiard halls, bars, and nightlife — search by name, city, country, or category.",
  "venues.searching": "Searching…",
  "venues.found": "{total} venues found",
  "venues.foundOne": "{total} venue found",
  "venues.showingAll": "Showing all published venues on GoSpots",
  "venues.filters": "Filters: {summary}",
  "venues.pricesIn": "Prices in {currency}",
  "venues.browse": "Browse venues",

  "venue.tab.overview": "Overview",
  "venue.tab.menu": "Menu",
  "venue.tab.activities": "Gaming floor",
  "venue.tab.dining": "Book a table",
  "venue.tab.reviews": "Reviews",
  "venue.tab.book": "Reserve",
  "venue.new": "New",
};

const pl: Dict = {
  ...en,
  "nav.explore": "Odkrywaj",
  "nav.how": "Jak to działa",
  "nav.faq": "FAQ",
  "nav.features": "Funkcje",
  "nav.pricing": "Cennik",
  "nav.signIn": "Zaloguj się",
  "nav.listVenue": "Dodaj lokal",
  "nav.listVenueShort": "Dodaj lokal",
  "nav.iOwnVenue": "Mam lokal",
  "nav.allVenues": "Wszystkie lokale",
  "nav.language": "Język",
  "nav.currency": "Waluta",

  "hero.manage.badge": "Operacje lokalu · prywatna beta",
  "hero.manage.titleA": "Prowadź salę",
  "hero.manage.titleB": "z jednego ekranu na żywo.",
  "hero.manage.subtitle":
    "Sesje, rezerwacje, rozliczenia i kontrola personelu — dla bilardów, stref gier i ruchliwych lokali. Najpierw wdrażamy operatorów, podczas gdy katalog publiczny rośnie.",
  "hero.manage.ctaPrimary": "Dodaj lokal — darmowy okres próbny",
  "hero.manage.ctaSecondary": "Zaloguj się",
  "hero.manage.pillar1": "Status stołów i konsol na żywo",
  "hero.manage.pillar2": "Timery, rachunki i zmiany bez zgadywania",
  "hero.manage.pillar3": "Szczera beta — najpierw lokale",

  "hero.play.badge": "Odkrywaj i rezerwuj",
  "hero.play.titleA": "Znajdź swoje",
  "hero.play.titleB": "ulubione miejsce.",
  "hero.play.subtitle":
    "Bilardy, strefy gier, restauracje, kawiarnie, bary i karaoke — szukaj po mieście i kategorii, rezerwuj gdy lokal to umożliwia.",
  "hero.play.ctaPrimary": "Przeglądaj lokale",
  "hero.play.ctaSecondary": "Prowadzę lokal",
  "hero.play.pillar1": "Od bilardu po brunch — jeden katalog",
  "hero.play.pillar2": "Filtruj po mieście, kategorii i klimacie",
  "hero.play.pillar3": "Rezerwuj, gdy lokal to włączy",

  "venues.worldwide": "Lokale na całym świecie",
  "venues.published": "{total} opublikowanych lokali · {countries} krajów",
  "venues.publishedOne": "{total} opublikowany lokal · {countries} krajów",
  "venues.tagline": "Znajdź swoje miejsce",
  "venues.subtitle":
    "Strefy gier, bilardy, bary i nightlife — szukaj po nazwie, mieście, kraju lub kategorii.",
  "venues.searching": "Szukam…",
  "venues.found": "Znaleziono {total} lokali",
  "venues.foundOne": "Znaleziono {total} lokal",
  "venues.showingAll": "Wszystkie opublikowane lokale na GoSpots",
  "venues.filters": "Filtry: {summary}",
  "venues.pricesIn": "Ceny w {currency}",
  "venues.browse": "Przeglądaj lokale",

  "venue.tab.overview": "Przegląd",
  "venue.tab.menu": "Menu",
  "venue.tab.activities": "Strefa gier",
  "venue.tab.dining": "Zarezerwuj stolik",
  "venue.tab.reviews": "Opinie",
  "venue.tab.book": "Rezerwuj",
  "venue.new": "Nowe",
};

const de: Dict = {
  ...en,
  "nav.explore": "Entdecken",
  "nav.how": "So funktioniert’s",
  "nav.faq": "FAQ",
  "nav.features": "Funktionen",
  "nav.pricing": "Preise",
  "nav.signIn": "Anmelden",
  "nav.listVenue": "Venue eintragen",
  "nav.listVenueShort": "Eintragen",
  "nav.iOwnVenue": "Ich habe eine Venue",
  "nav.allVenues": "Alle Venues",
  "nav.language": "Sprache",
  "nav.currency": "Währung",

  "hero.manage.badge": "Venue-Betrieb · private Beta",
  "hero.manage.titleA": "Den Floor steuern",
  "hero.manage.titleB": "von einem Live-Screen.",
  "hero.manage.subtitle":
    "Sessions, Reservierungen, Abrechnung und Team — für Billard, Gaming-Lounges und volle Floors. Wir onboarden zuerst Betreiber, während das Verzeichnis wächst.",
  "hero.manage.ctaPrimary": "Venue eintragen — Testphase",
  "hero.manage.ctaSecondary": "Anmelden",
  "hero.manage.pillar1": "Live-Status von Tischen & Konsolen",
  "hero.manage.pillar2": "Timer, Tabs und Übergaben ohne Rätselraten",
  "hero.manage.pillar3": "Ehrliche Beta — Venues zuerst",

  "hero.play.badge": "Entdecken & reservieren",
  "hero.play.titleA": "Finde deinen",
  "hero.play.titleB": "nächsten Favoriten.",
  "hero.play.subtitle":
    "Billard, Gaming-Lounges, Restaurants, Cafés, Bars und Karaoke — nach Stadt und Kategorie suchen, dann reservieren wenn die Venue es erlaubt.",
  "hero.play.ctaPrimary": "Venues durchsuchen",
  "hero.play.ctaSecondary": "Ich betreibe eine Venue",
  "hero.play.pillar1": "Von Billard bis Brunch — ein Verzeichnis",
  "hero.play.pillar2": "Nach Stadt, Kategorie und Vibe filtern",
  "hero.play.pillar3": "Reservieren, wenn die Venue es aktiviert",

  "venues.worldwide": "Venues weltweit",
  "venues.published": "{total} veröffentlichte Venues · {countries} Länder",
  "venues.publishedOne": "{total} veröffentlichte Venue · {countries} Länder",
  "venues.tagline": "Finde deinen Spot",
  "venues.subtitle":
    "Gaming-Lounges, Billard, Bars und Nightlife — Suche nach Name, Stadt, Land oder Kategorie.",
  "venues.searching": "Suche…",
  "venues.found": "{total} Venues gefunden",
  "venues.foundOne": "{total} Venue gefunden",
  "venues.showingAll": "Alle veröffentlichten Venues auf GoSpots",
  "venues.filters": "Filter: {summary}",
  "venues.pricesIn": "Preise in {currency}",
  "venues.browse": "Venues durchsuchen",

  "venue.tab.overview": "Übersicht",
  "venue.tab.menu": "Speisekarte",
  "venue.tab.activities": "Gaming-Bereich",
  "venue.tab.dining": "Tisch reservieren",
  "venue.tab.reviews": "Bewertungen",
  "venue.tab.book": "Reservieren",
  "venue.new": "Neu",
};

const fr: Dict = {
  ...en,
  "nav.explore": "Explorer",
  "nav.how": "Comment ça marche",
  "nav.faq": "FAQ",
  "nav.features": "Fonctionnalités",
  "nav.pricing": "Tarifs",
  "nav.signIn": "Connexion",
  "nav.listVenue": "Ajouter un lieu",
  "nav.listVenueShort": "Ajouter",
  "nav.iOwnVenue": "J’ai un lieu",
  "nav.allVenues": "Tous les lieux",
  "nav.language": "Langue",
  "nav.currency": "Devise",

  "hero.manage.badge": "Gestion de lieu · bêta privée",
  "hero.manage.titleA": "Pilotez la salle",
  "hero.manage.titleB": "depuis un écran en direct.",
  "hero.manage.subtitle":
    "Sessions, réservations, facturation et équipe — pour billards, salles de jeux et floors animés. Nous onboardons d’abord les opérateurs pendant que l’annuaire public grandit.",
  "hero.manage.ctaPrimary": "Ajouter un lieu — essai gratuit",
  "hero.manage.ctaSecondary": "Connexion",
  "hero.manage.pillar1": "Statut live des tables et consoles",
  "hero.manage.pillar2": "Timers, notes et passations sans approximatif",
  "hero.manage.pillar3": "Bêta honnête — lieux d’abord",

  "hero.play.badge": "Découvrir et réserver",
  "hero.play.titleA": "Trouvez votre",
  "hero.play.titleB": "prochain spot.",
  "hero.play.subtitle":
    "Billards, salles de jeux, restaurants, cafés, bars et karaoke — cherchez par ville et catégorie, puis réservez si le lieu l’active.",
  "hero.play.ctaPrimary": "Parcourir les lieux",
  "hero.play.ctaSecondary": "Je gère un lieu",
  "hero.play.pillar1": "Du billard au brunch — un annuaire",
  "hero.play.pillar2": "Filtrer par ville, catégorie et ambiance",
  "hero.play.pillar3": "Réserver quand le lieu l’autorise",

  "venues.worldwide": "Lieux dans le monde",
  "venues.published": "{total} lieux publiés · {countries} pays",
  "venues.publishedOne": "{total} lieu publié · {countries} pays",
  "venues.tagline": "Trouvez votre spot",
  "venues.subtitle":
    "Salles de jeux, billards, bars et nightlife — recherchez par nom, ville, pays ou catégorie.",
  "venues.searching": "Recherche…",
  "venues.found": "{total} lieux trouvés",
  "venues.foundOne": "{total} lieu trouvé",
  "venues.showingAll": "Tous les lieux publiés sur GoSpots",
  "venues.filters": "Filtres : {summary}",
  "venues.pricesIn": "Prix en {currency}",
  "venues.browse": "Parcourir les lieux",

  "venue.tab.overview": "Aperçu",
  "venue.tab.menu": "Menu",
  "venue.tab.activities": "Espace jeux",
  "venue.tab.dining": "Réserver une table",
  "venue.tab.reviews": "Avis",
  "venue.tab.book": "Réserver",
  "venue.new": "Nouveau",
};

const es: Dict = {
  ...en,
  "nav.explore": "Explorar",
  "nav.how": "Cómo funciona",
  "nav.faq": "FAQ",
  "nav.features": "Funciones",
  "nav.pricing": "Precios",
  "nav.signIn": "Iniciar sesión",
  "nav.listVenue": "Publicar local",
  "nav.listVenueShort": "Publicar",
  "nav.iOwnVenue": "Tengo un local",
  "nav.allVenues": "Todos los locales",
  "nav.language": "Idioma",
  "nav.currency": "Moneda",

  "hero.manage.badge": "Operaciones del local · beta privada",
  "hero.manage.titleA": "Dirige el salón",
  "hero.manage.titleB": "desde una pantalla en vivo.",
  "hero.manage.subtitle":
    "Sesiones, reservas, facturación y personal — para billares, lounges de juegos y salones ajetreados. Primero onboardeamos operadores mientras crece el directorio.",
  "hero.manage.ctaPrimary": "Publicar local — prueba gratis",
  "hero.manage.ctaSecondary": "Iniciar sesión",
  "hero.manage.pillar1": "Estado en vivo de mesas y consolas",
  "hero.manage.pillar2": "Temporizadores, cuentas y relevos sin adivinar",
  "hero.manage.pillar3": "Beta honesta — locales primero",

  "hero.play.badge": "Descubre y reserva",
  "hero.play.titleA": "Encuentra tu",
  "hero.play.titleB": "próximo favorito.",
  "hero.play.subtitle":
    "Billares, lounges, restaurantes, cafés, bares y karaoke — busca por ciudad y categoría, luego reserva si el local lo permite.",
  "hero.play.ctaPrimary": "Ver locales",
  "hero.play.ctaSecondary": "Tengo un local",
  "hero.play.pillar1": "Del billar al brunch — un directorio",
  "hero.play.pillar2": "Filtra por ciudad, categoría y ambiente",
  "hero.play.pillar3": "Reserva cuando el local lo active",

  "venues.worldwide": "Locales en el mundo",
  "venues.published": "{total} locales publicados · {countries} países",
  "venues.publishedOne": "{total} local publicado · {countries} países",
  "venues.tagline": "Encuentra tu sitio",
  "venues.subtitle":
    "Lounges de juegos, billares, bares y nightlife — busca por nombre, ciudad, país o categoría.",
  "venues.searching": "Buscando…",
  "venues.found": "{total} locales encontrados",
  "venues.foundOne": "{total} local encontrado",
  "venues.showingAll": "Todos los locales publicados en GoSpots",
  "venues.filters": "Filtros: {summary}",
  "venues.pricesIn": "Precios en {currency}",
  "venues.browse": "Ver locales",

  "venue.tab.overview": "Resumen",
  "venue.tab.menu": "Carta",
  "venue.tab.activities": "Zona de juegos",
  "venue.tab.dining": "Reservar mesa",
  "venue.tab.reviews": "Reseñas",
  "venue.tab.book": "Reservar",
  "venue.new": "Nuevo",
};

const ar: Dict = {
  ...en,
  "nav.explore": "استكشف",
  "nav.how": "كيف يعمل",
  "nav.faq": "الأسئلة",
  "nav.features": "الميزات",
  "nav.pricing": "الأسعار",
  "nav.signIn": "تسجيل الدخول",
  "nav.listVenue": "أضف مكانك",
  "nav.listVenueShort": "أضف مكانًا",
  "nav.iOwnVenue": "أملك مكانًا",
  "nav.allVenues": "كل الأماكن",
  "nav.language": "اللغة",
  "nav.currency": "العملة",

  "hero.manage.badge": "تشغيل المكان · نسخة تجريبية خاصة",
  "hero.manage.titleA": "أدر الصالة",
  "hero.manage.titleB": "من شاشة مباشرة واحدة.",
  "hero.manage.subtitle":
    "الجلسات والحجوزات والفوترة والموظفين — لقاعات البلياردو وصالات الألعاب والأماكن المزدحمة. نبدأ بضم المشغّلين بينما ينمو الدليل العام.",
  "hero.manage.ctaPrimary": "أضف مكانك — تجربة مجانية",
  "hero.manage.ctaSecondary": "تسجيل الدخول",
  "hero.manage.pillar1": "حالة الطاولات والأجهزة مباشرة",
  "hero.manage.pillar2": "مؤقتات وفواتير وتسليم ورديات بلا تخمين",
  "hero.manage.pillar3": "تجربة صادقة — الأماكن أولًا",

  "hero.play.badge": "اكتشف واحجز",
  "hero.play.titleA": "اعثر على",
  "hero.play.titleB": "مكانك المفضل.",
  "hero.play.subtitle":
    "بلياردو وصالات ألعاب ومطاعم ومقاهٍ وبارات وكاريوكي — ابحث حسب المدينة والفئة ثم احجز عندما يفعّل المكان ذلك.",
  "hero.play.ctaPrimary": "تصفح الأماكن",
  "hero.play.ctaSecondary": "أدير مكانًا",
  "hero.play.pillar1": "من البلياردو إلى الإفطار — دليل واحد",
  "hero.play.pillar2": "صفِّ حسب المدينة والفئة والأجواء",
  "hero.play.pillar3": "احجز عندما يفعّل المكان الحجز",

  "venues.worldwide": "أماكن حول العالم",
  "venues.published": "{total} أماكن منشورة · {countries} دول",
  "venues.publishedOne": "{total} مكان منشور · {countries} دول",
  "venues.tagline": "اعثر على مكانك",
  "venues.subtitle":
    "صالات ألعاب وبلياردو وبارات وحياة ليلية — ابحث بالاسم أو المدينة أو الدولة أو الفئة.",
  "venues.searching": "جارٍ البحث…",
  "venues.found": "تم العثور على {total} أماكن",
  "venues.foundOne": "تم العثور على {total} مكان",
  "venues.showingAll": "كل الأماكن المنشورة على GoSpots",
  "venues.filters": "عوامل التصفية: {summary}",
  "venues.pricesIn": "الأسعار بـ {currency}",
  "venues.browse": "تصفح الأماكن",

  "venue.tab.overview": "نظرة عامة",
  "venue.tab.menu": "القائمة",
  "venue.tab.activities": "منطقة الألعاب",
  "venue.tab.dining": "احجز طاولة",
  "venue.tab.reviews": "المراجعات",
  "venue.tab.book": "احجز",
  "venue.new": "جديد",
};

const catalogs: Record<PublicLocale, Dict> = { en, pl, de, fr, es, ar };

export function translatePublic(
  locale: string,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const code = (locale in catalogs ? locale : "en") as PublicLocale;
  let out = catalogs[code][key] ?? catalogs.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.replaceAll(`{${k}}`, String(v));
    }
  }
  return out;
}

export function isRtlPublicLocale(locale: string) {
  return locale === "ar";
}
