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
    title: "Bar & snacks",
    description: "Add drinks and snacks to any live session in one tap.",
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
    title: "Daily revenue reports",
    description: "Revenue by table, by cashier, by hour. Cash vs card. Today vs yesterday.",
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

export type OwnerStep = { title: string; description: string; icon: LucideIcon };

export const ownerSteps: OwnerStep[] = [
  {
    title: "Add your venue",
    description: "Create your account, add branches, tables, consoles. Set hourly rates in seconds.",
    icon: Crown,
  },
  {
    title: "Run live shifts",
    description: "Cashiers start and end sessions from the operations screen. Bills generate on close.",
    icon: Activity,
  },
  {
    title: "Track every dollar",
    description: "Daily reports, staff actions, and revenue by table — across every branch you own.",
    icon: Wallet,
  },
];

export type PlayerStep = { title: string; description: string; icon: LucideIcon };

export const playerSteps: PlayerStep[] = [
  {
    title: "Discover venues",
    description: "Browse billiard halls, gaming lounges, and esports cafés in your city.",
    icon: Gamepad2,
  },
  {
    title: "Reserve a table",
    description: "Pick a time slot, lock your spot, get a confirmation. Show up and play.",
    icon: CalendarCheck,
  },
  {
    title: "Pay clean",
    description: "Itemized bills, no surprises. Earn loyalty perks at your favorite spots.",
    icon: CreditCard,
  },
];

export type VenueCard = {
  name: string;
  city: string;
  tags: string[];
  rating: number;
  reviews: number;
  open: boolean;
  busy: number;
  total: number;
  accent: string;
  image: string;
};

export const venues: VenueCard[] = [
  {
    name: "Cue & Cobra",
    city: "Warsaw · Mokotów",
    tags: ["Billiard", "Snooker", "Bar"],
    rating: 4.9,
    reviews: 482,
    open: true,
    busy: 7,
    total: 10,
    accent: "from-emerald-500/40 via-emerald-600/10 to-transparent",
    image:
      "https://images.unsplash.com/photo-1615722440048-da4fd9202b9d?auto=format&fit=crop&w=900&q=70",
  },
  {
    name: "Pixel Arena",
    city: "Kraków · Stare Miasto",
    tags: ["PlayStation", "PC", "Tournaments"],
    rating: 4.8,
    reviews: 316,
    open: true,
    busy: 14,
    total: 20,
    accent: "from-violet-500/40 via-violet-600/10 to-transparent",
    image:
      "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=900&q=70",
  },
  {
    name: "Black 8 Lounge",
    city: "Wrocław · Centrum",
    tags: ["Billiard", "Darts", "Late-night"],
    rating: 4.7,
    reviews: 251,
    open: true,
    busy: 4,
    total: 8,
    accent: "from-amber-500/40 via-amber-600/10 to-transparent",
    image:
      "https://images.unsplash.com/photo-1551845041-63e8e76836ea?auto=format&fit=crop&w=900&q=70",
  },
  {
    name: "Knight & Pawn",
    city: "Poznań · Jeżyce",
    tags: ["Chess", "Cards", "Board Games"],
    rating: 4.9,
    reviews: 198,
    open: false,
    busy: 0,
    total: 12,
    accent: "from-cyan-500/40 via-cyan-600/10 to-transparent",
    image:
      "https://images.unsplash.com/photo-1529699211952-734e80c4d42b?auto=format&fit=crop&w=900&q=70",
  },
];

export type Plan = {
  name: string;
  price: string;
  period: string;
  description: string;
  highlight?: boolean;
  features: string[];
  cta: string;
};

export const plans: Plan[] = [
  {
    name: "Starter",
    price: "€29",
    period: "/month",
    description: "For one billiard hall finding its rhythm.",
    features: [
      "Up to 6 resources",
      "Owner only (0 staff seats)",
      "Live timer + auto billing",
      "Daily revenue report",
      "1 branch",
    ],
    cta: "Start free trial",
  },
  {
    name: "Standard",
    price: "€79",
    period: "/month",
    description: "For mixed venues with bar and reservations.",
    highlight: true,
    features: [
      "Up to 20 resources",
      "5 staff accounts",
      "Bar & snacks module",
      "Reservations",
      "Standard reports",
    ],
    cta: "Go Standard",
  },
  {
    name: "Pro",
    price: "€149",
    period: "/month",
    description: "For serious operators that scale.",
    features: [
      "Up to 100 resources",
      "20 staff accounts",
      "Roles & permissions",
      "Memberships & loyalty",
      "Peak hours & cashier reports",
    ],
    cta: "Upgrade to Pro",
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For chains and multi-branch businesses.",
    features: [
      "Unlimited branches",
      "Unlimited users",
      "Branch comparison",
      "Custom integrations",
      "Priority support",
    ],
    cta: "Talk to sales",
  },
];

export type Testimonial = {
  quote: string;
  name: string;
  role: string;
  rating: number;
};

export const testimonials: Testimonial[] = [
  {
    quote:
      "We used to lose 200 PLN a night to forgotten timers. After GoSpots that vanished in the first week.",
    name: "Marek Kowalski",
    role: "Owner · Cue & Cobra, Warsaw",
    rating: 5,
  },
  {
    quote:
      "Cashier shift handover used to take 20 minutes of arguing. Now it's two taps and a report.",
    name: "Ania Wójcik",
    role: "Manager · Pixel Arena",
    rating: 5,
  },
  {
    quote:
      "I run three branches from one dashboard. I see revenue per table per branch live. It changed how I think about the business.",
    name: "Tomáš Novak",
    role: "Founder · Black 8 Group",
    rating: 5,
  },
];

export type Stat = { value: string; label: string; icon: LucideIcon };

export const stats: Stat[] = [
  { value: "240+", label: "Venues running daily", icon: LayoutDashboard },
  { value: "1.4M", label: "Sessions billed", icon: Timer },
  { value: "€18M", label: "Revenue tracked", icon: Wallet },
  { value: "99.98%", label: "Realtime uptime", icon: Activity },
];

export type Faq = { q: string; a: string };

export const faqs: Faq[] = [
  {
    q: "Do I need to install anything in my venue?",
    a: "No. GoSpots runs in the browser on the device you already have — laptop, tablet, or counter PC. Updates push automatically.",
  },
  {
    q: "Can I try it before I pay?",
    a: "Yes. New venues get a 7-day Starter trial on signup. No card required — full Starter features while you decide, then subscribe to keep them.",
  },
  {
    q: "Will it work for my mixed venue (billiard + PS + bar)?",
    a: "Yes. Resources can be tables, consoles, boards, or anything billable. Mix freely on one floor screen.",
  },
  {
    q: "How does pricing work for multiple branches?",
    a: "Starter and Standard cover one branch. Pro covers multi-location with shared staff. Enterprise covers unlimited branches with central dashboards.",
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

export type NavLink = { label: string; href: string };

export const navLinks: NavLink[] = [
  { label: "Play", href: "/venues" },
  { label: "For venues", href: "#features" },
  { label: "How it works", href: "#how" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export const trustIcons: { label: string; icon: LucideIcon }[] = [
  { label: "Audit-grade logging", icon: History },
  { label: "Multi-tenant isolation", icon: ShieldCheck },
  { label: "Loved by 240+ venues", icon: Star },
  { label: "Built for busy nights", icon: Users },
];
