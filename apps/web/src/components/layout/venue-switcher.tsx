"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronDown,
  Crown,
  Link2,
  Loader2,
  LogOut,
  Plus,
  Store,
  X,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ModalPortal } from "@/components/ui/modal-portal";
import { cn } from "@/lib/cn";
import {
  createVenue,
  linkVenues,
  previewLinkVenues,
  type LinkableVenue,
} from "@/lib/auth-client";
import { ApiError } from "@/lib/api";
import {
  resolveEffectiveTier,
  type SubscriptionTier,
} from "@/lib/plan";
import { ensureOnboardingProgress } from "@/lib/onboarding-progress";
import { dashboardHref } from "@/lib/venue-dashboard";
import { useAuth } from "@/lib/use-auth";
import { useCurrentMembership } from "@/lib/use-current-membership";
import {
  membershipPublicPath,
  sortMemberships,
  switchVenuePreserveRoute,
  toPublicVenuePath,
} from "@/lib/venue-dashboard";
import { useVenuePath } from "@/lib/venue-context";
import { setStoredVenuePath } from "@/lib/venue-api-headers";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";
import { staffFloorT } from "@/lib/staff-floor-i18n";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function VenueSwitcher({
  className,
  compact = false,
}: {
  className?: string;
  /** Single-line name only — for cramped mobile top bars. */
  compact?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const venuePath = useVenuePath();
  const { state, reload, signOut } = useAuth();
  const currentMembership = useCurrentMembership();
  const vs = useVenueSettingsOptional();
  const t = useMemo(() => vs?.t ?? staffFloorT(vs?.locale), [vs?.t, vs?.locale]);
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const memberships =
    state.status === "authed" ? state.user.memberships : [];
  const venues = sortMemberships(memberships, venuePath);
  const isOwnerAccount =
    state.status === "authed" && state.user.accountType === "VENUE_OWNER";
  const canAddVenue = isOwnerAccount;
  const canEndSession = !canAddVenue;

  const sub = currentMembership?.shop.subscription ?? null;
  const effectiveTier = resolveEffectiveTier(
    sub
      ? {
          tier: sub.tier as SubscriptionTier,
          status: sub.status as "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELED",
          trialEndsAt: sub.trialEndsAt,
        }
      : null,
  );
  const isOwner = currentMembership?.role === "OWNER";
  const roleLabel =
    currentMembership?.role === "OWNER"
      ? t("venueSwitcher.roleOwner")
      : currentMembership?.role === "MANAGER"
        ? t("venueSwitcher.roleManager")
        : t("venueSwitcher.roleStaff");

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function switchTo(nextSecretOrPublic: string) {
    const nextPublic = toPublicVenuePath(nextSecretOrPublic);
    const target = venues.find(
      (m) => membershipPublicPath(m) === nextPublic,
    );
    const publicPath = target
      ? membershipPublicPath(target)
      : nextSecretOrPublic;
    if (publicPath === venuePath) {
      setOpen(false);
      return;
    }
    if (target) setStoredVenuePath(membershipPublicPath(target));
    setOpen(false);
    router.push(switchVenuePreserveRoute(pathname, venuePath, publicPath));
  }

  async function endSession() {
    setSigningOut(true);
    try {
      setOpen(false);
      await signOut();
      router.replace("/login");
    } finally {
      setSigningOut(false);
    }
  }

  if (!currentMembership) return null;

  return (
    <>
      <div ref={rootRef} className={cn("relative", className)}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "group flex w-full items-center text-left transition",
            compact
              ? "min-h-11 gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2"
              : "gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
            "hover:border-amber-400/30 hover:bg-[var(--color-surface-2)]",
            open && "border-amber-400/35 bg-[var(--color-surface-2)]",
          )}
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <span
            className={cn(
              "grid shrink-0 place-items-center rounded-xl border border-amber-400/20 bg-amber-500/10 text-amber-200",
              compact ? "h-8 w-8" : "h-10 w-10",
            )}
          >
            <Store size={compact ? 14 : 17} />
          </span>
          <span className="min-w-0 flex-1">
            {!compact ? (
              <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                {canAddVenue
                  ? t("venueSwitcher.activeVenue")
                  : t("venueSwitcher.yourWorkspace")}
              </span>
            ) : null}
            <span className="block truncate text-sm font-semibold text-white">
              {currentMembership.shop.name}
            </span>
            {!compact ? (
              <span className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">
                  {isOwner ? <Crown size={9} className="text-amber-300" /> : null}
                  {roleLabel}
                </span>
                <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-200">
                  {effectiveTier}
                </span>
              </span>
            ) : null}
          </span>
          <ChevronDown
            size={compact ? 14 : 16}
            className={cn(
              "shrink-0 text-zinc-500 transition group-hover:text-zinc-300",
              open && "rotate-180 text-amber-200",
            )}
          />
        </button>

        <AnimatePresence>
          {open ? (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-50 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] shadow-2xl shadow-black/40"
              role="listbox"
            >
              <div className="border-b border-white/5 px-3.5 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                  {venues.length > 1
                    ? t("venueSwitcher.switchVenue")
                    : t("venueSwitcher.currentVenue")}
                </p>
                {venues.length > 1 ? (
                  <p className="mt-0.5 text-[10px] text-zinc-600">
                    {t("venueSwitcher.venuesCount", { n: venues.length })}
                  </p>
                ) : (
                  <p className="mt-0.5 text-[10px] text-zinc-600">
                    {canAddVenue
                      ? t("venueSwitcher.addVenueHint")
                      : t("venueSwitcher.endSessionHint")}
                  </p>
                )}
              </div>
              <ul className="venue-switcher-list max-h-[14rem] overflow-y-auto overscroll-contain p-1.5">
                {venues.map((m) => {
                  const path = membershipPublicPath(m);
                  const active = path === venuePath;
                  const tier = resolveEffectiveTier(
                    m.shop.subscription
                      ? {
                          tier: m.shop.subscription.tier as SubscriptionTier,
                          status: m.shop.subscription.status as
                            | "TRIAL"
                            | "ACTIVE"
                            | "PAST_DUE"
                            | "CANCELED",
                          trialEndsAt: m.shop.subscription.trialEndsAt,
                        }
                      : null,
                  );
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => switchTo(path)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition",
                          active
                            ? "bg-amber-500/10 text-amber-50"
                            : "text-zinc-300 hover:bg-white/[0.04]",
                        )}
                      >
                        <span
                          className={cn(
                            "grid h-8 w-8 shrink-0 place-items-center rounded-lg border",
                            active
                              ? "border-amber-400/30 bg-amber-500/15 text-amber-200"
                              : "border-white/10 bg-white/[0.03] text-zinc-400",
                          )}
                        >
                          <Store size={14} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {m.shop.name}
                          </span>
                          <span className="text-[10px] text-zinc-500">
                            {m.role === "OWNER"
                              ? t("venueSwitcher.roleOwner")
                              : m.role === "MANAGER"
                                ? t("venueSwitcher.roleManager")
                                : t("venueSwitcher.roleStaff")}{" "}
                            · {tier}
                          </span>
                        </span>
                        {active ? (
                          <Check
                            size={14}
                            className="shrink-0 text-amber-300"
                          />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="border-t border-white/5 p-1.5">
                {canAddVenue ? (
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      setAddOpen(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2.5 text-sm text-amber-200 transition hover:bg-amber-500/10"
                  >
                    <Plus size={15} />
                    {t("venueSwitcher.addVenue")}
                  </button>
                ) : null}
                {canEndSession ? (
                  <button
                    type="button"
                    onClick={() => void endSession()}
                    disabled={signingOut}
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2.5 text-sm text-rose-300 transition hover:bg-rose-500/10 disabled:opacity-60"
                  >
                    {signingOut ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <LogOut size={15} />
                    )}
                    {t("venueSwitcher.endSession")}
                  </button>
                ) : null}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {addOpen ? (
        <AddVenueDialog
          onClose={() => setAddOpen(false)}
          onDone={async (nextVenuePath, opts) => {
            setAddOpen(false);
            await reload();
            if (!nextVenuePath) return;
            if (opts?.startOnboarding) {
              ensureOnboardingProgress(nextVenuePath, opts.shopId ?? null);
              router.push(dashboardHref(nextVenuePath, "/onboarding"));
              return;
            }
            router.push(
              switchVenuePreserveRoute(pathname, venuePath, nextVenuePath),
            );
          }}
        />
      ) : null}
    </>
  );
}

function AddVenueDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (
    venuePath: string | null,
    opts?: { shopId?: string | null; startOnboarding?: boolean },
  ) => void | Promise<void>;
}) {
  const vs = useVenueSettingsOptional();
  const t = useMemo(() => vs?.t ?? staffFloorT(vs?.locale), [vs?.t, vs?.locale]);
  const [mode, setMode] = useState<"create" | "link">("create");
  const [shopName, setShopName] = useState("");
  const [shopSlug, setShopSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [linkEmail, setLinkEmail] = useState("");
  const [linkPassword, setLinkPassword] = useState("");
  const [linkable, setLinkable] = useState<LinkableVenue[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slugTouched) setShopSlug(slugify(shopName));
  }, [shopName, slugTouched]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const name = shopName.trim();
    const slug = shopSlug.trim().toLowerCase();
    if (!name) {
      setError(t("venueSwitcher.nameRequired"));
      return;
    }
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
      setError(t("venueSwitcher.slugInvalid"));
      return;
    }
    setBusy(true);
    try {
      const res = await createVenue({ shopName: name, shopSlug: slug });
      await onDone(res.venuePath, {
        shopId: res.shop.id,
        startOnboarding: true,
      });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t("venueSwitcher.createFailed"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitLinkPreview(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!linkEmail.trim() || !linkPassword) {
      setError(t("venueSwitcher.emailPasswordRequired"));
      return;
    }
    setBusy(true);
    try {
      const res = await previewLinkVenues(
        linkEmail.trim(),
        linkPassword,
      );
      setLinkable(res.venues);
      setSelectedIds(res.venues.map((v) => v.id));
      if (res.message) setError(res.message);
    } catch (err) {
      setLinkable(null);
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t("venueSwitcher.findFailed"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitLinkConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selectedIds.length) {
      setError(t("venueSwitcher.selectAtLeastOne"));
      return;
    }
    setBusy(true);
    try {
      const res = await linkVenues({
        email: linkEmail.trim(),
        password: linkPassword,
        shopIds: selectedIds,
      });
      await onDone(res.venuePath);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t("venueSwitcher.linkFailed"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[400] flex items-end justify-center sm:items-center sm:p-4">
        <button
          type="button"
          aria-label={t("venueSwitcher.close")}
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        />
        <div className="relative z-10 w-full max-w-md overflow-hidden rounded-t-2xl border border-white/10 bg-zinc-950 shadow-2xl sm:rounded-2xl">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <h2 className="text-lg font-semibold text-white">
              {t("venueSwitcher.addVenueTitle")}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-white/5"
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1 border-b border-white/10 p-2">
            <button
              type="button"
              onClick={() => {
                setMode("create");
                setError(null);
              }}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition",
                mode === "create"
                  ? "bg-emerald-500/15 text-emerald-200"
                  : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              {t("venueSwitcher.createNew")}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("link");
                setError(null);
              }}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition",
                mode === "link"
                  ? "bg-emerald-500/15 text-emerald-200"
                  : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              <Link2 size={14} />
              {t("venueSwitcher.linkExisting")}
            </button>
          </div>

          {mode === "create" ? (
            <form onSubmit={(e) => void submitCreate(e)}>
              <div className="space-y-4 p-5">
                <p className="text-sm text-zinc-400">
                  {t("venueSwitcher.createDesc")}
                </p>
                <label className="block">
                  <span className="text-xs font-medium text-zinc-400">
                    {t("venueSwitcher.venueNameLabel")}
                  </span>
                  <input
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400/40"
                    placeholder={t("venueSwitcher.venueNamePlaceholder")}
                    autoFocus
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-zinc-400">
                    {t("venueSwitcher.publicSlugLabel")}
                  </span>
                  <div className="mt-1.5 flex items-center rounded-lg border border-white/10 bg-zinc-900 px-3 py-2.5">
                    <span className="text-sm text-zinc-500">/venue/</span>
                    <input
                      value={shopSlug}
                      onChange={(e) => {
                        setSlugTouched(true);
                        setShopSlug(e.target.value.toLowerCase());
                      }}
                      className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none"
                      placeholder={t("venueSwitcher.slugPlaceholder")}
                    />
                  </div>
                </label>
                {error ? <p className="text-sm text-rose-400">{error}</p> : null}
              </div>
              <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:bg-white/5"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-60"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : null}
                  {t("venueSwitcher.createVenue")}
                </button>
              </div>
            </form>
          ) : (
            <form
              onSubmit={(e) =>
                void (linkable ? submitLinkConfirm(e) : submitLinkPreview(e))
              }
            >
              <div className="space-y-4 p-5">
                <p className="text-sm text-zinc-400">
                  {t("venueSwitcher.linkDesc")}
                </p>
                <label className="block">
                  <span className="text-xs font-medium text-zinc-400">
                    {t("venueSwitcher.ownerEmailLabel")}
                  </span>
                  <input
                    type="email"
                    value={linkEmail}
                    onChange={(e) => {
                      setLinkEmail(e.target.value);
                      setLinkable(null);
                    }}
                    disabled={!!linkable}
                    className="mt-1.5 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400/40 disabled:opacity-60"
                    placeholder={t("venueSwitcher.ownerEmailPlaceholder")}
                    autoFocus={!linkable}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-zinc-400">
                    {t("venueSwitcher.passwordLabel")}
                  </span>
                  <input
                    type="password"
                    value={linkPassword}
                    onChange={(e) => {
                      setLinkPassword(e.target.value);
                      setLinkable(null);
                    }}
                    disabled={!!linkable}
                    className="mt-1.5 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400/40 disabled:opacity-60"
                    autoComplete="current-password"
                  />
                </label>

                {linkable && linkable.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-zinc-400">
                      {t("venueSwitcher.selectVenuesLabel")}
                    </p>
                    <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-white/10 p-2">
                      {linkable.map((v) => {
                        const on = selectedIds.includes(v.id);
                        return (
                          <li key={v.id}>
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedIds((prev) =>
                                  on
                                    ? prev.filter((id) => id !== v.id)
                                    : [...prev, v.id],
                                )
                              }
                              className={cn(
                                "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm",
                                on
                                  ? "bg-emerald-500/10 text-emerald-100"
                                  : "text-zinc-300 hover:bg-white/[0.04]",
                              )}
                            >
                              <span
                                className={cn(
                                  "grid h-4 w-4 place-items-center rounded border",
                                  on
                                    ? "border-emerald-400 bg-emerald-500 text-zinc-950"
                                    : "border-white/20",
                                )}
                              >
                                {on ? <Check size={10} /> : null}
                              </span>
                              <span className="min-w-0 flex-1 truncate">
                                {v.name}
                                <span className="block text-[10px] text-zinc-500">
                                  /venue/{v.slug}
                                  {v.city ? ` · ${v.city}` : ""}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}

                {error ? <p className="text-sm text-rose-400">{error}</p> : null}
              </div>
              <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
                {linkable ? (
                  <button
                    type="button"
                    onClick={() => {
                      setLinkable(null);
                      setError(null);
                    }}
                    className="mr-auto rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-white/5"
                  >
                    {t("venueSwitcher.back")}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:bg-white/5"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={busy || (linkable != null && selectedIds.length === 0)}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-60"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : null}
                  {linkable ? t("venueSwitcher.linkSelected") : t("venueSwitcher.findVenues")}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
