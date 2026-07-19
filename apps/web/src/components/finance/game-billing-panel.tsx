"use client";

import {
  CalendarRange,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Gamepad2,
  Loader2,
  Pencil,
  Plus,
  StopCircle,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { formatEventWindow } from "@/lib/seating-event-datetime";
import {
  createWalkIn,
  defaultPlayBillingRange,
  fetchPlayBilling,
  markGameBillingPaid,
  updateWalkIn,
  type PlayBillingItem,
  type PlayBillingResponse,
  type PlayBillingTab,
} from "@/lib/play-billing-client";
import { publishLiveEvent } from "@/lib/live-events";
import { BowlingModePicker } from "@/components/gaming/bowling-mode-picker";
import {
  buildBowlingNotes,
  suggestBowlingWalkInAmount,
} from "@/lib/bowling-booking";
import {
  listBowlingModes,
  modeToOfferingConfig,
  resolveBowlingMode,
} from "@/lib/bowling-modes";
import { bookingCollectsPartySize } from "@/lib/booking-unit-kind";
import { fetchResourceCatalog, type ResourceCatalog } from "@/lib/resources-client";
import { useLiveData } from "@/lib/use-live-data";
import { useVenueHref } from "@/lib/venue-context";
import { useVenueSettings } from "@/lib/venue-settings-context";
import { GameBillingEditDialog } from "./game-billing-edit-dialog";

const PAGE_SIZE = 10;

const TABS: {
  id: PlayBillingTab;
  label: string;
  hint: string;
}[] = [
  {
    id: "in_progress",
    label: "In progress",
    hint: "Guests playing now — booked sessions move here automatically when their time starts.",
  },
  {
    id: "awaiting_payment",
    label: "Awaiting payment",
    hint: "Sessions that ended and need payment. Mark paid when you collect.",
  },
  {
    id: "paid",
    label: "Paid",
    hint: "Already collected. Filter by date to review past days.",
  },
];

function formatSchedule(startsAt: string, endsAt: string) {
  return formatEventWindow(startsAt, endsAt) ?? "—";
}

export function GameBillingPanel({ canWrite }: { canWrite: boolean }) {
  const searchParams = useSearchParams();
  const focusReservationId = searchParams.get("reservationId");
  const initialTab = searchParams.get("tab") as PlayBillingTab | null;
  const { formatMoney } = useVenueSettings();
  const sessionsHref = useVenueHref("/sessions?tab=schedule");
  const gamingHref = useVenueHref("/resources");
  const defaultRange = defaultPlayBillingRange();

  const [tab, setTab] = useState<PlayBillingTab>(() =>
    initialTab === "in_progress" ||
    initialTab === "awaiting_payment" ||
    initialTab === "paid"
      ? initialTab
      : "awaiting_payment",
  );
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [data, setData] = useState<PlayBillingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<PlayBillingItem | null>(null);
  const [catalog, setCatalog] = useState<ResourceCatalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [showWalkInForm, setShowWalkInForm] = useState(false);

  const [wiResourceId, setWiResourceId] = useState("");
  const [wiGuest, setWiGuest] = useState("");
  const [wiMinutes, setWiMinutes] = useState("60");
  const [wiPlayers, setWiPlayers] = useState("1");
  const [wiBowlingModeId, setWiBowlingModeId] = useState("");
  const [wiAmount, setWiAmount] = useState("");
  const [wiAmountTouched, setWiAmountTouched] = useState(false);
  const [wiCreating, setWiCreating] = useState(false);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      setError(null);
      try {
        setData(
          await fetchPlayBilling({
            tab,
            from: tab === "in_progress" ? undefined : from,
            to: tab === "in_progress" ? undefined : to,
            page,
            pageSize: PAGE_SIZE,
          }),
        );
      } catch (e) {
        if (!opts?.silent) {
          setError(
            e instanceof Error ? e.message : "Could not load game billing.",
          );
        }
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [tab, from, to, page],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [tab, from, to]);

  useLiveData(() => load({ silent: true }), [tab, from, to, page], {
    intervalMs: 15_000,
    refreshOnSections: ["finance", "reservation", "operations"],
  });

  useEffect(() => {
    if (!showWalkInForm || catalog) return;
    void fetchResourceCatalog()
      .then(setCatalog)
      .catch(() => setCatalog(null));
  }, [showWalkInForm, catalog]);

  const items = data?.items ?? [];
  const total = data?.total ?? items.length;
  const pageCount = data?.pageCount ?? 1;
  const currentPage = data?.page ?? page;

  const activeTabHint = TABS.find((t) => t.id === tab)?.hint;

  const walkInUnits = useMemo(
    () =>
      catalog?.categories.flatMap((c) =>
        c.resources.map((r) => ({
          id: r.id,
          name: r.name,
          category: c.name,
          categoryType: c.type,
          bookingMode: c.bookingMode,
          offeringConfig: c.offeringConfig,
          slotMinutes: c.slotMinutes,
          rates: c.rates,
        })),
      ) ?? [],
    [catalog],
  );

  const wiSelectedUnit = useMemo(
    () => walkInUnits.find((u) => u.id === wiResourceId) ?? null,
    [walkInUnits, wiResourceId],
  );

  const wiIsBowling = wiSelectedUnit?.categoryType === "BOWLING";
  const wiBowlingModes = useMemo(
    () =>
      wiIsBowling && wiSelectedUnit
        ? listBowlingModes(
            wiSelectedUnit.offeringConfig,
            wiSelectedUnit.bookingMode,
            wiSelectedUnit.rates ?? [],
            wiSelectedUnit.slotMinutes ?? 60,
          )
        : [],
    [wiIsBowling, wiSelectedUnit],
  );
  const wiSelectedMode = useMemo(
    () =>
      wiBowlingModes.find((m) => m.id === wiBowlingModeId) ??
      wiBowlingModes[0] ??
      null,
    [wiBowlingModes, wiBowlingModeId],
  );
  const wiBowlingConfig = wiSelectedMode
    ? modeToOfferingConfig(wiSelectedMode)
    : null;
  const wiShowPlayers =
    wiIsBowling &&
    wiSelectedMode != null &&
    bookingCollectsPartySize("BOWLING", {
      bookingMode: wiSelectedUnit?.bookingMode ?? "TIME",
      notes: buildBowlingNotes(
        "",
        { id: wiSelectedMode.id, chargeType: wiSelectedMode.chargeType },
        1,
      ),
      offeringConfig: wiSelectedUnit?.offeringConfig,
      categoryRates: wiSelectedUnit?.rates,
      slotMinutes: wiSelectedMode.slotMinutes,
    });

  useEffect(() => {
    if (!wiIsBowling || wiBowlingModes.length === 0) return;
    setWiBowlingModeId((prev) => {
      if (prev && wiBowlingModes.some((m) => m.id === prev)) return prev;
      return wiBowlingModes[0].id;
    });
  }, [wiIsBowling, wiBowlingModes, wiResourceId]);

  useEffect(() => {
    if (!wiSelectedUnit) return;
    if (wiIsBowling) {
      setWiMinutes(String(wiSelectedUnit.slotMinutes || 60));
    }
  }, [wiSelectedUnit, wiIsBowling]);

  useEffect(() => {
    if (!wiSelectedUnit || wiAmountTouched) return;
    const duration = Math.max(1, parseInt(wiMinutes, 10) || 60);
    const players = Math.max(1, parseInt(wiPlayers, 10) || 1);
    const suggested = wiIsBowling && wiSelectedMode
      ? suggestBowlingWalkInAmount(
          wiSelectedMode,
          players,
          duration,
        )
      : null;
    if (suggested != null) {
      setWiAmount(String(suggested));
    }
  }, [
    wiSelectedUnit,
    wiIsBowling,
    wiSelectedMode,
    wiMinutes,
    wiPlayers,
    wiAmountTouched,
  ]);

  async function ensureCatalog() {
    if (catalog) return catalog;
    setCatalogLoading(true);
    try {
      const c = await fetchResourceCatalog();
      setCatalog(c);
      return c;
    } finally {
      setCatalogLoading(false);
    }
  }

  async function openEdit(item: PlayBillingItem) {
    if (!canWrite) return;
    setEditing(item);
    await ensureCatalog();
  }

  async function onEditSaved() {
    publishLiveEvent({ section: "finance" });
    publishLiveEvent({ section: "reservation" });
    await load({ silent: true });
  }

  async function onMarkPaid(item: PlayBillingItem) {
    if (!canWrite || item.isPaid) return;
    setBusyId(item.id);
    setError(null);
    try {
      await markGameBillingPaid(item);
      publishLiveEvent({ section: "finance" });
      publishLiveEvent({ section: "reservation" });
      await load({ silent: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not mark paid.");
    } finally {
      setBusyId(null);
    }
  }

  async function onEndWalkIn(item: PlayBillingItem) {
    if (!canWrite || item.source !== "walk_in") return;
    setBusyId(item.id);
    try {
      await updateWalkIn(item.id, { endSession: true });
      publishLiveEvent({ section: "finance" });
      await load({ silent: true });
      setTab("awaiting_payment");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not end session.");
    } finally {
      setBusyId(null);
    }
  }

  async function onCreateWalkIn(e: React.FormEvent) {
    e.preventDefault();
    if (!canWrite) return;
    setWiCreating(true);
    setError(null);
    try {
      const durationMinutes = Math.max(1, parseInt(wiMinutes, 10) || 60);
      const players = wiShowPlayers && wiBowlingConfig
        ? Math.max(
            wiBowlingConfig.minPlayers,
            Math.min(
              wiBowlingConfig.maxPlayers,
              parseInt(wiPlayers, 10) || wiBowlingConfig.minPlayers,
            ),
          )
        : 1;
      let amount = wiAmount.trim() ? Number(wiAmount) : 0;
      if (!wiAmount.trim() && wiIsBowling && wiSelectedMode) {
        const suggested = suggestBowlingWalkInAmount(
          wiSelectedMode,
          players,
          durationMinutes,
        );
        if (suggested != null) amount = suggested;
      }
      const note =
        wiIsBowling && wiSelectedMode
          ? buildBowlingNotes(
              "",
              {
                id: wiSelectedMode.id,
                chargeType: wiSelectedMode.chargeType,
              },
              1,
            )
          : undefined;

      await createWalkIn({
        resourceId: wiResourceId || undefined,
        label: wiGuest.trim() || undefined,
        playerCount: players,
        durationMinutes,
        amount,
        note,
      });
      publishLiveEvent({ section: "finance" });
      setWiGuest("");
      setWiPlayers("1");
      setWiAmount("");
      setWiAmountTouched(false);
      setShowWalkInForm(false);
      setTab("in_progress");
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start walk-in.");
    } finally {
      setWiCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-white/10 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-400">
        Bookings from{" "}
        <Link href={sessionsHref} className="text-emerald-400 underline">
          Reservations
        </Link>{" "}
        appear here when they start and move to{" "}
        <span className="text-zinc-300">Awaiting payment</span> when they end.
        Rates come from{" "}
        <Link href={gamingHref} className="text-emerald-400 underline">
          Gaming setup
        </Link>
        . Add walk-ins for guests who showed up without a booking.
      </div>

      {canWrite ? (
        <div className="rounded-xl border border-white/10 bg-zinc-950/50">
          <button
            type="button"
            onClick={() => setShowWalkInForm((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-white"
          >
            <span className="inline-flex items-center gap-2">
              <Plus size={16} className="text-emerald-400" />
              Add walk-in session
            </span>
            {showWalkInForm ? (
              <ChevronUp size={16} className="text-zinc-500" />
            ) : (
              <ChevronDown size={16} className="text-zinc-500" />
            )}
          </button>
          {showWalkInForm ? (
            <form
              onSubmit={(e) => void onCreateWalkIn(e)}
              className="space-y-3 border-t border-white/10 px-4 pb-4 pt-3"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs text-zinc-500">
                  Guest name (optional)
                  <input
                    value={wiGuest}
                    onChange={(e) => setWiGuest(e.target.value)}
                    placeholder="Walk-in"
                    className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                  />
                </label>
                <label className="block text-xs text-zinc-500">
                  Unit
                  <select
                    value={wiResourceId}
                    onChange={(e) => {
                      setWiResourceId(e.target.value);
                      setWiAmountTouched(false);
                    }}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                  >
                    <option value="">— pick later —</option>
                    {walkInUnits.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} · {u.category}
                      </option>
                    ))}
                  </select>
                </label>
                {wiIsBowling && wiBowlingModes.length > 0 ? (
                  <div className="sm:col-span-2">
                    <BowlingModePicker
                      modes={wiBowlingModes}
                      value={wiBowlingModeId}
                      onChange={(id) => {
                        setWiBowlingModeId(id);
                        setWiAmountTouched(false);
                      }}
                      label="Booking mode"
                    />
                  </div>
                ) : null}
                {wiShowPlayers && wiBowlingConfig ? (
                  <label className="block text-xs text-zinc-500">
                    Players ({wiBowlingConfig.minPlayers}–{wiBowlingConfig.maxPlayers})
                    <input
                      type="number"
                      min={wiBowlingConfig.minPlayers}
                      max={wiBowlingConfig.maxPlayers}
                      value={wiPlayers}
                      onChange={(e) => {
                        setWiPlayers(e.target.value);
                        setWiAmountTouched(false);
                      }}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                    />
                  </label>
                ) : null}
                <label className="block text-xs text-zinc-500">
                  Duration (min)
                  <input
                    type="number"
                    min={1}
                    value={wiMinutes}
                    onChange={(e) => {
                      setWiMinutes(e.target.value);
                      setWiAmountTouched(false);
                    }}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                  />
                </label>
                <label className="block text-xs text-zinc-500 sm:col-span-2">
                  Charge amount
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={wiAmount}
                    onChange={(e) => {
                      setWiAmount(e.target.value);
                      setWiAmountTouched(true);
                    }}
                    placeholder={
                      wiIsBowling
                        ? wiShowPlayers
                          ? "Per-person price × players (auto from Gaming setup)"
                          : "Lane rental for duration (auto from Gaming setup)"
                        : "Enter price or leave 0 to set later"
                    }
                    className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                  />
                  {wiIsBowling ? (
                    <span className="mt-1 block text-[10px] text-zinc-600">
                      {wiShowPlayers
                        ? "Per-person bowling — guest count affects the charge."
                        : "Lane rental — guest count does not affect the charge."}
                    </span>
                  ) : null}
                </label>
              </div>
              <button
                type="submit"
                disabled={wiCreating}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {wiCreating ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  "Start walk-in"
                )}
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {data?.summary ? (
        <div className="flex flex-wrap gap-2 text-[11px]">
          <button
            type="button"
            onClick={() => setTab("in_progress")}
            className={cn(
              "rounded-full border px-2.5 py-0.5 transition",
              tab === "in_progress"
                ? "border-sky-400/40 bg-sky-500/15 text-sky-200"
                : "border-sky-400/25 bg-sky-500/10 text-sky-200/80 hover:border-sky-400/40",
            )}
          >
            {data.summary.inProgress} in progress
          </button>
          <button
            type="button"
            onClick={() => setTab("awaiting_payment")}
            className={cn(
              "rounded-full border px-2.5 py-0.5 transition",
              tab === "awaiting_payment"
                ? "border-amber-400/40 bg-amber-500/15 text-amber-200"
                : "border-amber-400/25 bg-amber-500/10 text-amber-200/80 hover:border-amber-400/40",
            )}
          >
            {data.summary.awaitingPayment} awaiting payment
          </button>
          <button
            type="button"
            onClick={() => setTab("paid")}
            className={cn(
              "rounded-full border px-2.5 py-0.5 transition",
              tab === "paid"
                ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                : "border-emerald-400/25 bg-emerald-500/10 text-emerald-200/80 hover:border-emerald-400/40",
            )}
          >
            <span className="block">{data.summary.paid} paid</span>
            {tab !== "in_progress" ? (
              <span className="mt-0.5 block text-[10px] opacity-70">
                {formatMoney(data.summary.unpaidTotal)} due ·{" "}
                {formatMoney(data.summary.paidTotal)} collected
              </span>
            ) : null}
          </button>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium",
                tab === t.id
                  ? "bg-emerald-500/20 text-emerald-200"
                  : "bg-white/5 text-zinc-400 hover:text-zinc-200",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {activeTabHint ? (
          <p className="text-xs leading-relaxed text-zinc-500">{activeTabHint}</p>
        ) : null}
      </div>

      {tab !== "in_progress" ? (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-white/10 bg-zinc-950/50 p-3">
          <label className="min-w-0 flex-1 text-xs text-zinc-500 sm:flex-none">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block w-full min-w-0 max-w-full rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-white"
            />
          </label>
          <label className="min-w-0 flex-1 text-xs text-zinc-500 sm:flex-none">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 block w-full min-w-0 max-w-full rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-white"
            />
          </label>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5"
          >
            Apply
          </button>
        </div>
      ) : null}

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-7 animate-spin text-emerald-400" />
        </div>
      ) : total === 0 ? (
        <p className="rounded-lg border border-dashed border-white/15 p-10 text-center text-sm text-zinc-500">
          {tab === "in_progress"
            ? "No games in use right now."
            : tab === "awaiting_payment"
              ? "Nothing waiting for payment — finished sessions show up here automatically."
              : "No paid sessions in this period."}
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {items.map((item) => (
              <BillingRow
                key={`${item.source}-${item.id}`}
                item={item}
                canWrite={canWrite}
                busy={busyId === item.id}
                highlighted={
                  focusReservationId != null &&
                  item.source === "booking" &&
                  item.id === focusReservationId
                }
                formatMoney={formatMoney}
                onMarkPaid={() => void onMarkPaid(item)}
                onEdit={() => void openEdit(item)}
                onEndWalkIn={() => void onEndWalkIn(item)}
              />
            ))}
          </ul>
          <Pagination
            page={currentPage}
            pageCount={pageCount}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        </>
      )}

      {catalogLoading ? (
        <div className="fixed inset-0 z-[350] flex items-center justify-center bg-black/40">
          <Loader2 className="size-8 animate-spin text-emerald-400" />
        </div>
      ) : null}

      {editing && catalog ? (
        <GameBillingEditDialog
          item={editing}
          catalog={catalog}
          onClose={() => setEditing(null)}
          onSaved={onEditSaved}
        />
      ) : null}
    </div>
  );
}

function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
}) {
  if (total === 0) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-xs">
      <span className="text-zinc-500">
        Showing {start}–{end} of {total}
      </span>
      {pageCount > 1 ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="rounded-lg border border-white/10 p-1.5 text-zinc-400 hover:bg-white/5 disabled:opacity-30"
            aria-label="Previous page"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="min-w-[3.5rem] text-center text-zinc-400">
            {page} / {pageCount}
          </span>
          <button
            type="button"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
            className="rounded-lg border border-white/10 p-1.5 text-zinc-400 hover:bg-white/5 disabled:opacity-30"
            aria-label="Next page"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function BillingRow({
  item,
  canWrite,
  busy,
  highlighted,
  formatMoney,
  onMarkPaid,
  onEdit,
  onEndWalkIn,
}: {
  item: PlayBillingItem;
  canWrite: boolean;
  busy: boolean;
  highlighted?: boolean;
  formatMoney: (n: number) => string;
  onMarkPaid: () => void;
  onEdit: () => void;
  onEndWalkIn: () => void;
}) {
  const amount = item.isPaid
    ? (item.billedAmount ?? item.amountDue)
    : item.amountDue;

  return (
    <li
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3",
        highlighted && "ring-2 ring-amber-400/60",
        item.bucket === "in_progress"
          ? "border-sky-400/20 bg-sky-500/[0.06]"
          : item.isPaid
            ? "border-emerald-400/20 bg-emerald-500/[0.04]"
            : "border-amber-400/20 bg-amber-500/[0.04]",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-white">
          <Gamepad2 size={14} className="text-emerald-400" />
          {item.guestName}
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
              item.source === "walk_in"
                ? "bg-violet-500/15 text-violet-300"
                : "bg-zinc-500/15 text-zinc-400",
            )}
          >
            {item.source === "walk_in" ? "Walk-in" : "Booked"}
          </span>
          {item.resource ? (
            <span className="text-[11px] font-normal text-zinc-500">
              · {item.resource.name}
              {item.resource.categoryName
                ? ` (${item.resource.categoryName})`
                : ""}
            </span>
          ) : null}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
          <CalendarRange size={12} />
          {formatSchedule(item.startsAt, item.endsAt)}
          <span>·</span>
          <Clock size={12} />
          {item.durationMinutes} min
          {item.collectsPartySize ? (
            <>
              <span>·</span>
              {item.partySize} player{item.partySize > 1 ? "s" : ""}
            </>
          ) : null}
        </p>
        <p className="mt-1 text-[11px] text-zinc-600">
          {item.breakdown}
          {item.discountPercent > 0 ? ` · −${item.discountPercent}% off` : ""}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <span
          className={cn(
            "text-sm font-semibold tabular-nums",
            item.isPaid ? "text-emerald-300" : "text-amber-200",
          )}
        >
          {formatMoney(amount)}
          {!item.isPaid && item.discountPercent > 0 ? (
            <span className="ml-1 text-[10px] font-normal text-zinc-500 line-through">
              {formatMoney(item.baseAmount)}
            </span>
          ) : null}
        </span>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {canWrite ? (
            <button
              type="button"
              disabled={busy}
              onClick={onEdit}
              className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-white/5 disabled:opacity-50"
            >
              <Pencil size={12} />
              Edit
            </button>
          ) : null}
          {item.bucket === "in_progress" &&
          item.source === "walk_in" &&
          canWrite ? (
            <button
              type="button"
              disabled={busy}
              onClick={onEndWalkIn}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-400/30 px-2.5 py-1.5 text-xs text-amber-200 hover:bg-amber-500/10 disabled:opacity-50"
            >
              <StopCircle size={12} />
              End
            </button>
          ) : null}
          {item.isPaid ? (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-emerald-400/90">
              <Check size={12} />
              {item.bucket === "in_progress" ? "Prepaid" : "Paid"}
            </span>
          ) : canWrite ? (
            <button
              type="button"
              disabled={busy}
              onClick={onMarkPaid}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                "Mark paid"
              )}
            </button>
          ) : item.bucket === "in_progress" ? (
            <span className="text-[10px] text-sky-400/80">Playing</span>
          ) : (
            <span className="text-[10px] text-zinc-600">Unpaid</span>
          )}
        </div>
      </div>
    </li>
  );
}

/** @deprecated Use GameBillingPanel */
export const PlayBillingPanel = GameBillingPanel;
