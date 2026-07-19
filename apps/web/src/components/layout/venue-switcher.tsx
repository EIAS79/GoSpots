"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronDown,
  Crown,
  Link2,
  Loader2,
  Plus,
  Store,
  X,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
import { useAuth } from "@/lib/use-auth";
import { useCurrentMembership } from "@/lib/use-current-membership";
import {
  membershipVenuePath,
  sortMemberships,
  switchVenuePreserveRoute,
} from "@/lib/venue-dashboard";
import { useVenuePath } from "@/lib/venue-context";

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
  const { state, reload } = useAuth();
  const currentMembership = useCurrentMembership();
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const memberships =
    state.status === "authed" ? state.user.memberships : [];
  const venues = sortMemberships(memberships, venuePath);
  const isOwnerAccount =
    state.status === "authed" && state.user.accountType === "VENUE_OWNER";
  const canAddVenue = isOwnerAccount;

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

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function switchTo(nextPath: string) {
    if (nextPath === venuePath) {
      setOpen(false);
      return;
    }
    setOpen(false);
    router.push(switchVenuePreserveRoute(pathname, venuePath, nextPath));
  }

  if (!currentMembership) return null;

  return (
    <>
      <div ref={rootRef} className={cn("relative", className)}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex w-full items-center text-left transition",
            compact
              ? "min-h-11 gap-2 rounded-lg border border-white/10 bg-zinc-900/50 px-2.5 py-2"
              : "gap-2.5 rounded-xl border border-white/10 bg-zinc-900/50 px-3 py-2.5",
            "hover:border-emerald-400/25 hover:bg-zinc-900/80",
            open && "border-emerald-400/30 bg-zinc-900/80",
          )}
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <span
            className={cn(
              "grid shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-300",
              compact ? "h-8 w-8" : "h-9 w-9",
            )}
          >
            <Store size={compact ? 14 : 16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-white">
              {currentMembership.shop.name}
            </span>
            {!compact ? (
              <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                  {isOwner ? <Crown size={9} /> : null}
                  {currentMembership.role}
                </span>
                <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-200">
                  {effectiveTier}
                </span>
              </span>
            ) : null}
          </span>
          <ChevronDown
            size={compact ? 14 : 16}
            className={cn(
              "shrink-0 text-zinc-500 transition",
              open && "rotate-180 text-zinc-300",
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
              className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 overflow-hidden rounded-xl border border-white/10 bg-zinc-950 shadow-2xl"
              role="listbox"
            >
              <div className="border-b border-white/5 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                  Your venues
                </p>
                {venues.length > 1 ? (
                  <p className="mt-0.5 text-[10px] text-zinc-600">
                    Switch below — {venues.length} venues on this account
                  </p>
                ) : null}
              </div>
              <ul className="venue-switcher-list max-h-[14rem] overflow-y-auto overscroll-contain p-1.5">
                {venues.map((m) => {
                  const path = membershipVenuePath(m);
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
                          "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition",
                          active
                            ? "bg-emerald-500/10 text-emerald-100"
                            : "text-zinc-300 hover:bg-white/[0.04]",
                        )}
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white/[0.04] text-zinc-400">
                          <Store size={14} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {m.shop.name}
                          </span>
                          <span className="text-[10px] text-zinc-500">
                            {m.role} · {tier}
                          </span>
                        </span>
                        {active ? (
                          <Check
                            size={14}
                            className="shrink-0 text-emerald-400"
                          />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {isOwnerAccount ? (
                <div className="border-t border-white/5 p-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      setAddOpen(true);
                    }}
                    disabled={!canAddVenue}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition",
                      canAddVenue
                        ? "text-emerald-300 hover:bg-emerald-500/10"
                        : "cursor-not-allowed text-zinc-600",
                    )}
                  >
                    <Plus size={15} />
                    Add another venue
                  </button>
                </div>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {addOpen ? (
        <AddVenueDialog
          onClose={() => setAddOpen(false)}
          onDone={async (dashboardPath) => {
            setAddOpen(false);
            await reload();
            if (dashboardPath) {
              router.push(
                switchVenuePreserveRoute(pathname, venuePath, dashboardPath),
              );
            }
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
  onDone: (dashboardPath: string | null) => void | Promise<void>;
}) {
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
      setError("Venue name is required.");
      return;
    }
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
      setError("URL slug must use letters, numbers, and dashes only.");
      return;
    }
    setBusy(true);
    try {
      const res = await createVenue({ shopName: name, shopSlug: slug });
      await onDone(res.dashboardPath);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not create venue.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitLinkPreview(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!linkEmail.trim() || !linkPassword) {
      setError("Email and password are required.");
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
            : "Could not find venues for that login.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitLinkConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selectedIds.length) {
      setError("Select at least one venue to link.");
      return;
    }
    setBusy(true);
    try {
      const res = await linkVenues({
        email: linkEmail.trim(),
        password: linkPassword,
        shopIds: selectedIds,
      });
      await onDone(res.dashboardPath);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not link venues.",
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
          aria-label="Close"
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        />
        <div className="relative z-10 w-full max-w-md overflow-hidden rounded-t-2xl border border-white/10 bg-zinc-950 shadow-2xl sm:rounded-2xl">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <h2 className="text-lg font-semibold text-white">Add venue</h2>
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
              Create new
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
              Link existing
            </button>
          </div>

          {mode === "create" ? (
            <form onSubmit={(e) => void submitCreate(e)}>
              <div className="space-y-4 p-5">
                <p className="text-sm text-zinc-400">
                  Create another venue under this account. Switch anytime from
                  the sidebar list below the active venue.
                </p>
                <label className="block">
                  <span className="text-xs font-medium text-zinc-400">
                    Venue name
                  </span>
                  <input
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400/40"
                    placeholder="Cue & Cobra Downtown"
                    autoFocus
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-zinc-400">
                    Public URL slug
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
                      placeholder="cue-cobra-downtown"
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
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-60"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : null}
                  Create venue
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
                  Link venues that already exist under another owner login.
                  Enter that account’s email and password — we’ll list its
                  venues so you can add them here and switch in the sidebar.
                </p>
                <label className="block">
                  <span className="text-xs font-medium text-zinc-400">
                    Owner email
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
                    placeholder="owner@example.com"
                    autoFocus={!linkable}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-zinc-400">
                    Password
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
                      Select venues to link
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
                    Back
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || (linkable != null && selectedIds.length === 0)}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-60"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : null}
                  {linkable ? "Link selected" : "Find venues"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
