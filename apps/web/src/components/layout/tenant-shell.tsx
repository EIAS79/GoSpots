"use client";

import {
  BookOpen,
  CalendarRange,
  Clock,
  Crown,
  Bell,
  FileText,
  Gamepad2,
  Images,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  MessageSquare,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Star,
  StickyNote,
  UserCog,
  UtensilsCrossed,
  Wallet,
  X,
} from "lucide-react";
import {
  isFeatureUnlocked,
  resolveSubscriptionAccess,
  type FeatureKey,
  type SubscriptionTier,
} from "@/lib/plan";
import {
  showsDiningUi,
  showsGamingUi,
} from "@/lib/venue-packs";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { GoSpotsLogo } from "@/components/brand/gospots-logo";
import { VenueSwitcher } from "@/components/layout/venue-switcher";
import { NotificationHeaderActions } from "@/components/notifications/notification-header-actions";
import { NotificationToasts } from "@/components/notifications/notification-toasts";
import { fetchNotificationUnreadCount, fetchReservationNotificationBadges } from "@/lib/notifications-client";
import { cn } from "@/lib/cn";
import { hasPermission } from "@/lib/auth-client";
import { useVenueHref } from "@/lib/venue-context";
import { useCurrentMembership } from "@/lib/use-current-membership";
import { useAuth } from "@/lib/use-auth";

type NavItem = {
  segment: string;
  label: string;
  icon: typeof LayoutDashboard;
  perms?: string[];
  feature?: FeatureKey;
  /** Only show for gaming packs / gaming_floor add-on */
  gamingOnly?: boolean;
  /** Only show for dining/bar/hotel/mixed packs */
  diningOnly?: boolean;
  ownerOnly?: boolean;
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
      {
        segment: "/subscription",
        label: "Subscription & plan",
        icon: Crown,
        perms: ["subscription.manage"],
      },
      {
        segment: "/notifications",
        label: "Notifications",
        icon: Bell,
        perms: ["notifications.read"],
        feature: "notifications",
      },
      {
        segment: "/audit",
        label: "Audit log",
        icon: FileText,
        perms: ["audit.read"],
        feature: "audit",
      },
      {
        segment: "/reviews",
        label: "Reviews",
        icon: Star,
        perms: ["reviews.read"],
        feature: "reviews",
      },
    ],
  },
  {
    label: "Venue",
    items: [
      {
        segment: "/settings",
        label: "Shop settings",
        icon: Settings,
        perms: ["shop.manage"],
      },
      {
        segment: "/messages",
        label: "Guest messages",
        icon: MessageSquare,
        perms: ["shop.manage", "messaging.read", "notifications.read"],
        feature: "messaging",
      },
      { segment: "/menu", label: "Menu", icon: BookOpen, perms: ["menu.read"], feature: "menu" },
      {
        segment: "/gallery",
        label: "Gallery",
        icon: Images,
        perms: ["gallery.read"],
        feature: "gallery",
      },
      {
        segment: "/hours",
        label: "Hours & schedule",
        icon: Clock,
        perms: ["hours.read", "hours.write"],
        feature: "hours",
      },
      {
        segment: "/notes",
        label: "Shift notes",
        icon: StickyNote,
        perms: ["notes.read", "notes.write"],
        feature: "notes",
      },
      {
        segment: "/resources",
        label: "Gaming setup",
        icon: Gamepad2,
        perms: ["resource.read"],
        feature: "resource",
        gamingOnly: true,
      },
      {
        segment: "/dining",
        label: "Dining layout",
        icon: UtensilsCrossed,
        perms: ["resource.read"],
        feature: "resource",
        diningOnly: true,
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        segment: "/sessions",
        label: "Reservations",
        icon: CalendarRange,
        perms: ["reservation.read"],
        feature: "reservation",
      },
      {
        segment: "/orders",
        label: "Menu orders",
        icon: ShoppingCart,
        perms: ["transaction.read"],
        feature: "transaction",
      },
      {
        segment: "/play-billing",
        label: "Game billing",
        icon: Gamepad2,
        perms: ["transaction.read"],
        feature: "transaction",
        gamingOnly: true,
      },
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
        feature: "transaction",
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
  badge,
}: {
  item: NavItem;
  pathname: string;
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
        "group flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition",
        active
          ? "bg-emerald-500/10 text-emerald-200"
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
    </Link>
  );
}

export function TenantShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { state, signOut } = useAuth();
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [reservationBadgeTotal, setReservationBadgeTotal] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (state.status === "guest") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [state.status, router, pathname]);

  const currentMembership = useCurrentMembership();
  const canUseNotifications =
    state.status === "authed" &&
    (currentMembership?.role === "OWNER" ||
      hasPermission(currentMembership?.permissions ?? "", "notifications.read"));
  const canSeeReservationBadges =
    state.status === "authed" &&
    (currentMembership?.role === "OWNER" ||
      hasPermission(currentMembership?.permissions ?? "", "reservation.read"));

  useEffect(() => {
    if (state.status !== "authed" || !canUseNotifications) {
      setUnreadNotifications(0);
      return;
    }
    const load = () =>
      fetchNotificationUnreadCount()
        .then((r) => setUnreadNotifications(r.unreadCount))
        .catch(() => setUnreadNotifications(0));
    load();
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
  }, [state.status, pathname, canUseNotifications]);

  useEffect(() => {
    if (state.status !== "authed" || !canSeeReservationBadges) {
      setReservationBadgeTotal(0);
      return;
    }
    const load = () =>
      fetchReservationNotificationBadges()
        .then((r) => setReservationBadgeTotal(r.total))
        .catch(() => setReservationBadgeTotal(0));
    load();
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
  }, [state.status, pathname, canSeeReservationBadges]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [mobileNavOpen]);

  if (state.status === "loading" || state.status === "guest" || state.status !== "authed") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--color-background)]">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
      </div>
    );
  }

  const user = state.user;
  const perms = currentMembership?.permissions ?? "";
  const sub = currentMembership?.shop.subscription ?? null;
  const access = resolveSubscriptionAccess(
    sub
      ? {
          tier: sub.tier as SubscriptionTier,
          status: sub.status as "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELED",
          trialEndsAt: sub.trialEndsAt,
          packId: sub.packId,
          addOns: sub.addOns,
        }
      : null,
  );
  const modules = access.enabledModules;
  const packId = access.packId;
  const addOns = access.addOns;
  // Pack + selected add-ons only — trial must not force dining/gaming UI.
  const gamingUi = showsGamingUi(packId, addOns);
  const diningUi = showsDiningUi(packId, addOns);
  const isOwner = currentMembership?.role === "OWNER";

  const canSee = (item: NavItem) => {
    if (item.ownerOnly) return isOwner;
    if (item.gamingOnly && !gamingUi) return false;
    if (item.diningOnly && !diningUi) return false;
    // Unpicked / locked pack modules stay out of the sidebar.
    if (item.feature && !isFeatureUnlocked(modules, item.feature)) {
      return false;
    }
    if (isOwner) return true;
    if (!item.perms || item.perms.length === 0) return true;
    return item.perms.some((p) => hasPermission(perms, p));
  };

  const showAdminLinks = user.systemRole === "SUPER_ADMIN";

  function NavContent() {
    return (
      <>
        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
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
                        badge={
                          item.segment === "/notifications"
                            ? unreadNotifications
                            : item.segment === "/sessions"
                              ? reservationBadgeTotal
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
                      "group flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition",
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
              className="grid h-11 w-11 place-items-center rounded-md text-zinc-400 transition hover:bg-rose-500/10 hover:text-rose-300"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="flex h-dvh max-h-dvh min-h-0 w-full max-w-[100vw] overflow-hidden bg-[var(--color-background)] text-zinc-100">
      <aside className="hidden h-full min-h-0 w-64 shrink-0 flex-col border-r border-white/5 bg-zinc-950/60 backdrop-blur lg:flex">
        <div className="shrink-0 space-y-2.5 border-b border-white/5 px-4 py-3">
          <GoSpotsLogo href="/" size="sm" showTagline={false} />
          <VenueSwitcher />
        </div>
        <NavContent />
      </aside>

      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-zinc-950/95">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/5 px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5 md:px-6 lg:justify-end lg:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-2 lg:hidden">
            <button
              type="button"
              aria-label="Open navigation"
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen(true)}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-white/10 bg-zinc-900/70 text-zinc-200"
            >
              <Menu size={18} />
            </button>
            <div className="min-w-0 flex-1">
              <VenueSwitcher compact />
            </div>
          </div>
          <NotificationHeaderActions unreadCount={unreadNotifications} />
        </header>
        {mobileNavOpen ? (
          <div
            className="absolute inset-0 z-40 lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
          >
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setMobileNavOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
            />
            <div className="absolute inset-y-0 left-0 flex w-[min(21rem,88vw)] flex-col border-r border-white/10 bg-zinc-950 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-2xl">
              <div className="shrink-0 space-y-2.5 border-b border-white/5 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <GoSpotsLogo href="/" size="sm" showTagline={false} />
                  <button
                    type="button"
                    aria-label="Close navigation"
                    onClick={() => setMobileNavOpen(false)}
                    className="grid h-11 w-11 place-items-center rounded-lg border border-white/10 text-zinc-400"
                  >
                    <X size={18} />
                  </button>
                </div>
                <VenueSwitcher />
              </div>
              <NavContent />
            </div>
          </div>
        ) : null}
        <NotificationToasts onUnreadChange={setUnreadNotifications} />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}
