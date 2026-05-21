"use client";

import {
  BookOpen,
  CalendarRange,
  ChartColumn,
  ClipboardList,
  Clock,
  Crown,
  Bell,
  FileText,
  Gamepad2,
  Images,
  LayoutDashboard,
  Loader2,
  LogOut,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Lock,
  TrendingDown,
  UserCog,
  Wallet,
} from "lucide-react";
import {
  isFeatureUnlocked,
  resolveEffectiveTier,
  type FeatureKey,
  type SubscriptionTier,
} from "@/lib/plan";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { GoSpotsLogo } from "@/components/brand/gospots-logo";
import { NotificationHeaderActions } from "@/components/notifications/notification-header-actions";
import { NotificationToasts } from "@/components/notifications/notification-toasts";
import { fetchNotificationUnreadCount } from "@/lib/notifications-client";
import { cn } from "@/lib/cn";
import { hasPermission } from "@/lib/auth-client";
import { useVenueHref } from "@/lib/venue-context";
import { useAuth } from "@/lib/use-auth";

type NavItem = {
  segment: string;
  label: string;
  icon: typeof LayoutDashboard;
  perms?: string[];
  feature?: string;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { segment: "", label: "Overview", icon: LayoutDashboard },
      { segment: "/subscription", label: "Subscription & plan", icon: Crown },
      { segment: "/notifications", label: "Notifications", icon: Bell },
      { segment: "/audit", label: "Audit log", icon: FileText },
    ],
  },
  {
    label: "Venue",
    items: [
      { segment: "/settings", label: "Shop settings", icon: Settings },
      { segment: "/menu", label: "Menu", icon: BookOpen, perms: ["menu.read"] },
      { segment: "/gallery", label: "Gallery", icon: Images, perms: ["gallery.read"] },
      { segment: "/hours", label: "Hours & schedule", icon: Clock, perms: ["hours.write"] },
    ],
  },
  {
    label: "Operations",
    items: [
      { segment: "/operations", label: "Operations", icon: ClipboardList, perms: ["resource.read"] },
      { segment: "/sessions", label: "Reservations", icon: CalendarRange, perms: ["reservation.read"] },
      { segment: "/orders", label: "Menu orders", icon: ShoppingCart, perms: ["transaction.read"] },
      { segment: "/play-billing", label: "Play billing", icon: Gamepad2, perms: ["transaction.read"] },
      { segment: "/resources", label: "Gaming setup", icon: Gamepad2, perms: ["resource.read"] },
    ],
  },
  {
    label: "Finance",
    items: [
      {
        segment: "/finance",
        label: "Finance",
        icon: Wallet,
        perms: ["transaction.read"],
      },
    ],
  },
  {
    label: "Team",
    items: [
      {
        segment: "/staff",
        label: "Employee accounts",
        icon: UserCog,
        perms: ["staff.read"],
        feature: "roles",
      },
    ],
  },
];

function NavLink({
  item,
  pathname,
  locked,
  badge,
}: {
  item: NavItem;
  pathname: string;
  locked?: boolean;
  badge?: number;
}) {
  const href = useVenueHref(item.segment);
  const Icon = item.icon;
  const active =
    pathname === href || (item.segment !== "" && pathname.startsWith(href));
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition",
        active
          ? "bg-emerald-500/10 text-emerald-200"
          : locked
            ? "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-400"
            : "text-zinc-400 hover:bg-white/[0.04] hover:text-white",
      )}
    >
      <Icon
        size={15}
        className={cn(
          "transition",
          active ? "text-emerald-400" : "text-zinc-500 group-hover:text-zinc-300",
        )}
      />
      <span className="flex-1">{item.label}</span>
      {badge && badge > 0 ? (
        <span className="min-w-[1.25rem] rounded-full bg-emerald-500 px-1.5 py-0.5 text-center text-[10px] font-semibold text-zinc-950">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
      {locked && <Lock size={12} className="text-amber-500/80" />}
    </Link>
  );
}

export function TenantShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { state, signOut } = useAuth();
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    if (state.status === "guest") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [state.status, router, pathname]);

  useEffect(() => {
    if (state.status !== "authed") return;
    const load = () =>
      fetchNotificationUnreadCount()
        .then((r) => setUnreadNotifications(r.unreadCount))
        .catch(() => setUnreadNotifications(0));
    load();
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
  }, [state.status, pathname]);

  if (state.status === "loading" || state.status === "guest" || state.status !== "authed") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)]">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
      </div>
    );
  }

  const user = state.user;
  const primaryMembership = user.memberships[0] ?? null;
  const perms = primaryMembership?.permissions ?? "";
  const sub = primaryMembership?.shop.subscription ?? null;
  const effectiveTier = resolveEffectiveTier(
    sub
      ? {
          tier: sub.tier as SubscriptionTier,
          status: sub.status as "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELED",
          trialEndsAt: sub.trialEndsAt,
        }
      : null,
  );
  const isOwner = primaryMembership?.role === "OWNER";

  const canSee = (item: NavItem) => {
    if (isOwner) return true;
    if (!item.perms || item.perms.length === 0) return true;
    return item.perms.some((p) => hasPermission(perms, p));
  };

  const isLocked = (item: NavItem) => {
    if (!item.feature) return false;
    return !isFeatureUnlocked(effectiveTier, item.feature as FeatureKey);
  };

  const showAdminLinks = user.systemRole === "SUPER_ADMIN";

  return (
    <div className="flex h-screen max-h-screen min-h-0 w-full max-w-[100vw] overflow-hidden bg-[var(--color-background)] text-zinc-100">
      <aside className="hidden h-full min-h-0 w-64 shrink-0 flex-col border-r border-white/5 bg-zinc-950/60 backdrop-blur md:flex">
        <div className="shrink-0 border-b border-white/5 px-5 py-4">
          <GoSpotsLogo href="/" size="md" />
        </div>

        {primaryMembership && (
          <div className="shrink-0 border-b border-white/5 px-5 py-4">
            <p className="text-[10px] uppercase tracking-widest text-zinc-500">
              Current venue
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-white">
              {primaryMembership.shop.name}
            </p>
            <div className="mt-1.5 flex items-center gap-2 text-[10px] text-zinc-400">
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300">
                {isOwner && <Crown size={9} />}
                {primaryMembership.role}
              </span>
              <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-1.5 py-0.5 text-amber-200">
                {effectiveTier}
              </span>
            </div>
          </div>
        )}

        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4">
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter(canSee);
            if (items.length === 0) return null;
            return (
              <div key={group.label} className="mb-4">
                <p className="mb-1 px-3 text-[10px] uppercase tracking-widest text-zinc-600">
                  {group.label}
                </p>
                <ul className="flex flex-col gap-0.5">
                  {items.map((item) => (
                    <li key={item.segment}>
                      <NavLink
                        item={item}
                        pathname={pathname}
                        locked={isLocked(item)}
                        badge={
                          item.segment === "/notifications"
                            ? unreadNotifications
                            : undefined
                        }
                      />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          {showAdminLinks && (
            <div className="mb-4">
              <p className="mb-1 px-3 text-[10px] uppercase tracking-widest text-zinc-600">
                Platform
              </p>
              <ul className="flex flex-col gap-0.5">
                <li>
                  <Link
                    href="/admin"
                    className={cn(
                      "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition",
                      pathname.startsWith("/admin")
                        ? "bg-rose-500/10 text-rose-200"
                        : "text-zinc-400 hover:bg-white/[0.04] hover:text-white",
                    )}
                  >
                    <ShieldCheck size={15} />
                    Platform admin
                  </Link>
                </li>
              </ul>
            </div>
          )}
        </nav>

        <div className="shrink-0 border-t border-white/5 px-5 py-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-300">
              {(user.name?.[0] ?? user.email[0]).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-white">
                {user.name ?? user.email}
              </p>
              <p className="truncate text-[11px] text-zinc-500">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                void signOut().then(() => router.replace("/login"));
              }}
              aria-label="Sign out"
              className="grid h-8 w-8 place-items-center rounded-md text-zinc-400 transition hover:bg-rose-500/10 hover:text-rose-300"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-zinc-950/95">
        <header className="flex shrink-0 items-center justify-end gap-3 border-b border-white/5 px-4 py-2 md:px-6">
          <NotificationHeaderActions unreadCount={unreadNotifications} />
        </header>
        <NotificationToasts onUnreadChange={setUnreadNotifications} />
        <div className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}
