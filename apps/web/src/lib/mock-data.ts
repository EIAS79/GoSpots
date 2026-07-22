import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ChartColumn,
  Beer,
  CalendarCheck,
  CreditCard,
  Crown,
  Gamepad2,
  History,
  LayoutDashboard,
  Receipt,
  ShieldCheck,
  Star,
  Timer,
  Users,
  Wallet,
  Zap,
} from "lucide-react";

export type VenueType =
  | "Billiard"
  | "Snooker"
  | "Darts"
  | "PlayStation"
  | "Chess"
  | "Cards";

export type LiveTable = {
  id: string;
  name: string;
  type: VenueType;
  status: "available" | "busy" | "reserved" | "maintenance";
  minutes?: number;
  amount?: number;
  rate: number;
};

export const liveTables: LiveTable[] = [
  { id: "t1", name: "Table 1", type: "Billiard", status: "busy", minutes: 42, amount: 28, rate: 40 },
  { id: "t2", name: "Table 2", type: "Billiard", status: "available", rate: 40 },
  { id: "t3", name: "Snooker 1", type: "Snooker", status: "busy", minutes: 87, amount: 72.5, rate: 50 },
  { id: "t4", name: "Darts 1", type: "Darts", status: "reserved", rate: 20 },
  { id: "t5", name: "PS5 · Lounge", type: "PlayStation", status: "busy", minutes: 18, amount: 10.5, rate: 35 },
  { id: "t6", name: "Chess 1", type: "Chess", status: "available", rate: 10 },
  { id: "t7", name: "Pool 3", type: "Billiard", status: "maintenance", rate: 40 },
  { id: "t8", name: "PS5 · Arena", type: "PlayStation", status: "busy", minutes: 64, amount: 37.3, rate: 35 },
];

export type Feature = {
  title: string;
  description: string;
  icon: LucideIcon;
  span?: "sm" | "md" | "lg";
  accent?: string;
};

export const features: Feature[] = [
  {
    title: "Live operations screen",
    description:
      "See every table, console, and board in one card grid. Status, timer, and amount in three seconds.",
    icon: LayoutDashboard,
    span: "lg",
    accent: "from-emerald-500/20 to-emerald-500/0",
  },
  {
    title: "Session timer engine",
    description: "Start, pause, resume, end. Move a customer to a new table without losing a minute.",
    icon: Timer,
    span: "md",
    accent: "from-cyan-500/20 to-cyan-500/0",
  },
  {
    title: "Automatic billing",
    description: "Hourly + extras + discounts → receipt. No mental math, no missed charges.",
    icon: Receipt,
    span: "md",
    accent: "from-violet-500/20 to-violet-500/0",
  },
  {
    title: "Menu & kitchen orders",
    description:
      "Optional add-on: food and drink menus with kitchen tickets — for restaurants, bars, and cafés.",
    icon: Beer,
    span: "sm",
    accent: "from-amber-500/20 to-amber-500/0",
  },
  {
    title: "Staff control",
    description: "Roles, permissions, discount limits, and full audit trail for every action.",
    icon: ShieldCheck,
    span: "sm",
    accent: "from-rose-500/20 to-rose-500/0",
  },
  {
    title: "Realtime sync",
    description: "Owner, manager, cashier — same screen, same second, every change.",
    icon: Zap,
    span: "sm",
    accent: "from-blue-500/20 to-blue-500/0",
  },
  {
    title: "Revenue & shift reports",
    description:
      "Included with play billing or menu orders — revenue, losses, and shift summaries when those modules are on.",
    icon: ChartColumn,
    span: "md",
    accent: "from-emerald-500/20 to-emerald-500/0",
  },
  {
    title: "Reservations",
    description: "Hold tables for VIPs, prevent conflicts, convert reservations to live sessions.",
    icon: CalendarCheck,
    span: "sm",
    accent: "from-teal-500/20 to-teal-500/0",
  },
];

export type OwnerStep = { icon: LucideIcon };

/** Icons only — titles/bodies come from public i18n `how.step{n}` */
export const ownerSteps: OwnerStep[] = [
  { icon: Crown },
  { icon: Activity },
  { icon: Wallet },
];

export type PlayerStep = { title: string; description: string; icon: LucideIcon };

export const playerSteps: PlayerStep[] = [
  {
    title: "Discover spots",
    description:
      "Browse billiard halls, gaming lounges, restaurants, cafés, bars, and karaoke rooms in your city.",
    icon: Gamepad2,
  },
  {
    title: "Reserve your spot",
    description:
      "Pick a time slot, lock it in, get a confirmation. Show up and enjoy — table, station, or booth.",
    icon: CalendarCheck,
  },
  {
    title: "Confirm and go",
    description:
      "Lock your reservation, get a confirmation, and show up ready — table, station, or booth waiting.",
    icon: CreditCard,
  },
];

export type ShopStatus = "open" | "closed" | "closing_soon";

export type VenueCard = {
  name: string;
  /** City name (no country) */
  city: string;
  /** e.g. district or neighborhood */
  area?: string;
  country: string;
  tags: string[];
  rating: number;
  reviews: number;
  shopStatus: ShopStatus;
  busy: number;
  total: number;
  accent: string;
  image: string;
  description: string;
  /** Demo rate in EUR — format via public i18n + formatMoney */
  rateFromEur: number;
  rateUnit: "hr" | "session";
  /** Visitors currently inside (demo) */
  visitorsInside: number;
  /** Max venue capacity for occupancy bar */
  maxVisitors: number;
};

export function shopStatusLabel(status: ShopStatus): string {
  if (status === "open") return "Open";
  if (status === "closing_soon") return "Closing soon";
  return "Closed";
}

export function formatVenueLocation(v: Pick<VenueCard, "city" | "area" | "country">): string {
  const line = v.area ? `${v.city} · ${v.area}` : v.city;
  return `${line}, ${v.country}`;
}

export const venues: VenueCard[] = [
  {
    name: "Cue & Cobra",
    city: "Warsaw",
    area: "Mokotów",
    country: "Poland",
    tags: ["Billiard", "Snooker", "Bar"],
    rating: 4.9,
    reviews: 482,
    shopStatus: "open",
    busy: 7,
    total: 10,
    accent: "from-emerald-500/40 via-emerald-600/10 to-transparent",
    image:
      "https://images.unsplash.com/photo-1551845041-63e8e76836ea?auto=format&fit=crop&w=900&q=70",
    description: "Twelve tables, full bar, late-night league nights.",
    rateFromEur: 6.5,
    rateUnit: "hr",
    visitorsInside: 54,
    maxVisitors: 120,
  },
  {
    name: "Pixel Arena",
    city: "Kraków",
    area: "Stare Miasto",
    country: "Poland",
    tags: ["PlayStation", "PC", "Esports"],
    rating: 4.8,
    reviews: 316,
    shopStatus: "closing_soon",
    busy: 14,
    total: 20,
    accent: "from-violet-500/40 via-violet-600/10 to-transparent",
    image:
      "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=900&q=70",
    description: "LAN boxes, console lounges, and weekend brackets.",
    rateFromEur: 5.1,
    rateUnit: "hr",
    visitorsInside: 98,
    maxVisitors: 140,
  },
  {
    name: "Black 8 Lounge",
    city: "Wrocław",
    area: "Centrum",
    country: "Poland",
    tags: ["Billiard", "Darts", "Cocktails"],
    rating: 4.7,
    reviews: 251,
    shopStatus: "open",
    busy: 4,
    total: 8,
    accent: "from-amber-500/40 via-amber-600/10 to-transparent",
    image:
      "https://images.unsplash.com/photo-1551845041-63e8e76836ea?auto=format&fit=crop&w=900&q=70",
    description: "Dim lights, soul music, and eight championship tables.",
    rateFromEur: 8.1,
    rateUnit: "hr",
    visitorsInside: 31,
    maxVisitors: 90,
  },
  {
    name: "Knight & Pawn",
    city: "Poznań",
    area: "Jeżyce",
    country: "Poland",
    tags: ["Chess", "Cards", "Café"],
    rating: 4.9,
    reviews: 198,
    shopStatus: "closed",
    busy: 0,
    total: 12,
    accent: "from-cyan-500/40 via-cyan-600/10 to-transparent",
    image:
      "https://images.unsplash.com/photo-1529699211952-734e80c4d42b?auto=format&fit=crop&w=900&q=70",
    description: "Quiet boards, specialty coffee, and weekly chess ladders.",
    rateFromEur: 2.8,
    rateUnit: "session",
    visitorsInside: 0,
    maxVisitors: 45,
  },
  {
    name: "Neon Break",
    city: "Berlin",
    area: "Kreuzberg",
    country: "Germany",
    tags: ["Arcade", "Rhythm", "VR"],
    rating: 4.6,
    reviews: 412,
    shopStatus: "open",
    busy: 11,
    total: 16,
    accent: "from-fuchsia-500/35 via-rose-500/15 to-transparent",
    image:
      "https://images.unsplash.com/photo-1556438064-2d7646166914?auto=format&fit=crop&w=900&q=70",
    description: "Retro cabinets mixed with modern VR bays and snack bar.",
    rateFromEur: 8,
    rateUnit: "hr",
    visitorsInside: 72,
    maxVisitors: 110,
  },
  {
    name: "Velvet Cue",
    city: "Amsterdam",
    area: "De Pijp",
    country: "Netherlands",
    tags: ["Snooker", "VIP rooms", "Bar"],
    rating: 4.8,
    reviews: 167,
    shopStatus: "closing_soon",
    busy: 3,
    total: 6,
    accent: "from-teal-500/35 via-emerald-600/12 to-transparent",
    image:
      "https://images.unsplash.com/photo-1572116469696-31de0f17cc34?auto=format&fit=crop&w=900&q=70",
    description: "Members-first snooker suites with table-side service.",
    rateFromEur: 45,
    rateUnit: "hr",
    visitorsInside: 22,
    maxVisitors: 48,
  },
];

/** Honest “why operators care” — not customer quotes */
export type VenuePainPoint = {
  title: string;
  description: string;
  icon: LucideIcon;
};

export const venuePainPoints: VenuePainPoint[] = [
  {
    title: "Forgotten timers",
    description:
      "Busy nights turn into guesswork. Minutes slip, tabs grow, and nobody agrees what was actually on the clock.",
    icon: Timer,
  },
  {
    title: "Reservation conflicts",
    description:
      "Walk-ins collide with holds, VIPs overlap, and the floor map in the manager’s head stops matching reality.",
    icon: CalendarCheck,
  },
  {
    title: "Wrong or disputed bills",
    description:
      "Hourly rates, extras, and discounts get mixed when everything lives on paper or scattered chats.",
    icon: Receipt,
  },
  {
    title: "Staff discounts without control",
    description:
      "You need trust on the floor — but also limits, roles, and a trail when something looks off.",
    icon: ShieldCheck,
  },
  {
    title: "No live floor visibility",
    description:
      "Owners step away for an hour and lose sight of what’s playing, what’s reserved, and what’s actually earning.",
    icon: LayoutDashboard,
  },
  {
    title: "Weak end-of-night reporting",
    description:
      "Closing the drawer shouldn’t take spreadsheets. You want per-table, per-cashier clarity without the drama.",
    icon: ChartColumn,
  },
];

export type Faq = { q: string; a: string };

/** FAQ shown in the owner / "I run a venue" view */
export const ownerFaqs: Faq[] = [
  {
    q: "Do I need to install anything in my venue?",
    a: "No. GoSpots runs in the browser on the device you already have — laptop, tablet, or counter PC. Updates push automatically.",
  },
  {
    q: "Can I try it before I pay?",
    a: "Yes. New venues get a 90-day free trial — no card required. Pick any features you want and change them freely during the trial. Nothing is ever charged without your consent.",
  },
  {
    q: "How does pricing actually work?",
    a: "Your venue type is free. You only pay for the features you switch on — each has its own monthly price — plus €4 per employee seat. No tiers, no bundles.",
  },
  {
    q: "What happens if I turn a feature off?",
    a: "Your data is never deleted — the section just disappears from the dashboard. Switch the feature back on and everything is exactly where you left it. On a paid plan, removals apply from the next billing month.",
  },
  {
    q: "Will it work for my mixed venue (billiard + PS + bar)?",
    a: "Yes. Resources can be tables, consoles, boards, or anything billable. Mix freely on one floor screen.",
  },
  {
    q: "Is my venue data isolated from others?",
    a: "Yes. Every record is tenant-scoped at the database layer. No venue can ever see another venue's data.",
  },
  {
    q: "What about my staff making mistakes?",
    a: "Every important action — discount, cancel, refund, price change — goes into an immutable audit log tied to the user.",
  },
];

/** FAQ shown in the guest / "find a spot" view */
export const playerFaqs: Faq[] = [
  {
    q: "Is GoSpots free for guests?",
    a: "Completely. Browsing venues, checking details, and reserving a spot never costs you anything — venues pay for their tools, not you.",
  },
  {
    q: "What kinds of places are on GoSpots?",
    a: "Way more than gaming. Billiard halls, gaming lounges, and esports cafés — plus restaurants, cafés, bars, pubs, karaoke rooms, bowling alleys, night clubs, and family entertainment venues.",
  },
  {
    q: "How do I find a spot near me?",
    a: "Search the directory by city, country, and category, or start from a vibe — a table for dinner, a lane for bowling, or a station for your squad.",
  },
  {
    q: "Can I reserve online?",
    a: "When a venue enables reservations, you'll see a booking option on its page. Pick a time, lock your spot, and just show up.",
  },
  {
    q: "Do I need an account to browse?",
    a: "No account needed to browse and discover venues. You only sign in when a venue's booking flow requires it.",
  },
  {
    q: "Why don't I see many venues yet?",
    a: "GoSpots is in private beta and onboarding operators first. The public directory grows with every venue that turns on publishing.",
  },
];

export type NavLink = { labelKey: string; href: string; fallback: string };

export const navLinks: NavLink[] = [
  { labelKey: "nav.explore", href: "/venues", fallback: "Explore" },
  { labelKey: "nav.how", href: "#how", fallback: "How it works" },
  { labelKey: "nav.features", href: "#features", fallback: "Features" },
  { labelKey: "nav.pricing", href: "#pricing", fallback: "Pricing" },
  { labelKey: "nav.faq", href: "#faq", fallback: "FAQ" },
];

export const trustIcons: { label: string; icon: LucideIcon }[] = [
  { label: "Immutable audit trail", icon: History },
  { label: "Tenant-isolated data", icon: ShieldCheck },
  { label: "Built for peak-hour floors", icon: Users },
  { label: "Private beta — venues first", icon: Star },
];
