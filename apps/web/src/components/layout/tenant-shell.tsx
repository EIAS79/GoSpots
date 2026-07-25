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
  Receipt,
  Settings,
  ShieldCheck,
  ClipboardCheck,
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
import { DashboardSidebarBrand } from "@/components/brand/dashboard-sidebar-brand";
import { VenueSwitcher } from "@/components/layout/venue-switcher";
import { NotificationHeaderActions } from "@/components/notifications/notification-header-actions";
import { NotificationToasts } from "@/components/notifications/notification-toasts";
import { fetchNotificationUnreadCount, fetchReservationNotificationBadges } from "@/lib/notifications-client";
import { fetchGuestChatBadge } from "@/lib/staff-guest-chat-client";
import { cn } from "@/lib/cn";
import { hasPermission } from "@/lib/auth-client";
import { useVenueHref } from "@/lib/venue-context";
import { useCurrentMembership } from "@/lib/use-current-membership";
import { useAuth } from "@/lib/use-auth";
import type { MessageKey } from "@/lib/i18n";
import { translate } from "@/lib/i18n";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";
import { OnboardingResumeBanner } from "@/components/onboarding/onboarding-resume-banner";

type NavItem = {
  segment: string;
  labelKey: MessageKey;
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
  labelKey: MessageKey;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: "nav.group.overview",
    items: [
      { segment: "", labelKey: "nav.overview", icon: LayoutDashboard },
      {
        segment: "/subscription",
        labelKey: "nav.subscription",
        icon: Crown,
        perms: ["subscription.manage"],
      },
      {
        segment: "/notifications",
        labelKey: "nav.notifications",
        icon: Bell,
        perms: ["notifications.read"],
        feature: "notifications",
      },
      {
        segment: "/audit",
        labelKey: "nav.audit",
        icon: FileText,
        perms: ["audit.read"],
        feature: "audit",
      },
      {
        segment: "/reviews",
        labelKey: "nav.reviews",
        icon: Star,
        perms: ["reviews.read"],
        feature: "reviews",
      },
    ],
  },
  {
    labelKey: "nav.group.venue",
    items: [
      {
        segment: "/settings",
        labelKey: "nav.settings",
        icon: Settings,
        perms: ["shop.manage"],
      },
      {
        segment: "/messages",
        labelKey: "nav.messages",
        icon: MessageSquare,
        perms: ["shop.manage", "messaging.read", "notifications.read"],
        feature: "messaging",
      },
      {
        segment: "/menu",
        labelKey: "nav.menu",
        icon: BookOpen,
        perms: ["menu.read"],
        feature: "menu",
      },
      {
        segment: "/gallery",
        labelKey: "nav.gallery",
        icon: Images,
        perms: ["gallery.read"],
        feature: "gallery",
      },
      {
        segment: "/hours",
        labelKey: "nav.hours",
        icon: Clock,
        perms: ["hours.read", "hours.write"],
        feature: "hours",
      },
      {
        segment: "/notes",
        labelKey: "nav.notes",
        icon: StickyNote,
        perms: ["notes.read", "notes.write"],
        feature: "notes",
      },
      {
        segment: "/resources",
        labelKey: "nav.gaming",
        icon: Gamepad2,
        perms: ["resource.read"],
        feature: "resource",
        gamingOnly: true,
      },
      {
        segment: "/dining",
        labelKey: "nav.dining",
        icon: UtensilsCrossed,
        perms: ["resource.read"],
        feature: "resource",
        diningOnly: true,
      },
    ],
  },
  {
    labelKey: "nav.group.operations",
    items: [
      {
        segment: "/sessions",
        labelKey: "nav.sessions",
        icon: CalendarRange,
        perms: ["reservation.read"],
        feature: "reservation",
      },
      {
        segment: "/orders",
        labelKey: "nav.orders",
        icon: ShoppingCart,
        perms: ["transaction.read"],
        feature: "transaction",
      },
      {
        segment: "/guest-checks",
        labelKey: "nav.guestChecks",
        icon: Receipt,
        perms: ["transaction.read"],
        feature: "transaction",
      },
      {
        segment: "/play-billing",
        labelKey: "nav.playBilling",
        icon: Gamepad2,
        perms: ["transaction.read"],
        feature: "transaction",
        gamingOnly: true,
      },
    ],
  },
  {
    labelKey: "nav.group.finance",
    items: [
      {
        segment: "/finance",
        labelKey: "nav.finance",
        icon: Wallet,
        perms: ["transaction.read"],
        feature: "transaction",
      },
    ],
  },
  {
    labelKey: "nav.group.team",
    items: [
      {
        segment: "/approvals",
        labelKey: "nav.approvals",
        icon: ClipboardCheck,
      },
      {
        segment: "/staff",
        labelKey: "nav.staff",
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
  label,
}: {
  item: NavItem;
  pathname: string;
  badge?: number;
  label: string;
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
      <span className="flex-1">{label}</span>
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
  const [messagesBadgeTotal, setMessagesBadgeTotal] = useState(0);
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
  const canSeeMessagesBadges =
    state.status === "authed" &&
    (currentMembership?.role === "OWNER" ||
      hasPermission(currentMembership?.permissions ?? "", "messaging.read") ||
      hasPermission(currentMembership?.permissions ?? "", "shop.manage") ||
      hasPermission(currentMembership?.permissions ?? "", "notifications.read"));

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
    if (state.status !== "authed" || !canSeeMessagesBadges) {
      setMessagesBadgeTotal(0);
      return;
    }
    const load = () =>
      fetchGuestChatBadge()
        .then((r) => setMessagesBadgeTotal(r.total))
        .catch(() => setMessagesBadgeTotal(0));
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [state.status, pathname, canSeeMessagesBadges]);

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
          addOnRows: sub.addOnRows,
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
  const venueSettings = useVenueSettingsOptional();
  const t =
    venueSettings?.t ??
    ((key: MessageKey, vars?: Record<string, string | number>) =>
      translate("en", key, vars));

  function NavContent() {
    return (
      <>
        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter(canSee);
            if (items.length === 0) return null;
            return (
              <div key={group.labelKey} className="mb-4">
                <p className="mb-1 px-3 text-[10px] uppercase tracking-widest text-zinc-600">
                  {t(group.labelKey)}
                </p>
                <ul className="flex flex-col gap-0.5">
                  {items.map((item) => (
                    <li key={item.segment}>
                      <NavLink
                        item={item}
                        pathname={pathname}
                        label={t(item.labelKey)}
                        badge={
                          item.segment === "/notifications"
                            ? unreadNotifications
                            : item.segment === "/sessions"
                              ? reservationBadgeTotal
                              : item.segment === "/messages"
                                ? messagesBadgeTotal
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
                {t("nav.platformGroup")}
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
                    {t("nav.platformAdmin")}
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
              aria-label={t("nav.signOut")}
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
    <div className="flex h-dvh max-h-dvh min-h-0 w-full max-w-[100vw] overflow-hidden bg-[var(--color-background)] text-[var(--color-foreground)]">
      <aside className="hidden h-full min-h-0 w-64 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-background)] lg:flex">
        <div className="shrink-0 space-y-3 border-b border-[var(--color-border)] px-3.5 py-3.5">
          <DashboardSidebarBrand />
          <VenueSwitcher />
        </div>
        <NavContent />
      </aside>

      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--color-background)]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5 md:px-6 lg:justify-end lg:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-2 lg:hidden">
            <button
              type="button"
              aria-label={t("nav.openNavigation")}
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen(true)}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)]"
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
            aria-label={t("nav.navigation")}
          >
            <button
              type="button"
              aria-label={t("nav.closeNavigation")}
              onClick={() => setMobileNavOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
            />
            <div className="absolute inset-y-0 left-0 flex w-[min(21rem,88vw)] flex-col border-r border-[var(--color-border)] bg-[var(--color-background)] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-2xl">
              <div className="shrink-0 space-y-3 border-b border-[var(--color-border)] px-3.5 py-3.5">
                <div className="flex items-start justify-between gap-2">
                  <DashboardSidebarBrand className="min-w-0 flex-1" />
                  <button
                    type="button"
                    aria-label={t("nav.closeNavigation")}
                    onClick={() => setMobileNavOpen(false)}
                    className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-[var(--color-border)] text-[color-mix(in_srgb,var(--color-foreground)_55%,transparent)]"
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
        <OnboardingResumeBanner />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}
