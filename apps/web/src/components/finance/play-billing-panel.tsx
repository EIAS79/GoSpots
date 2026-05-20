"use client";

import {
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Gamepad2,
  Loader2,
  Pencil,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { formatEventWindow } from "@/lib/seating-event-datetime";
import {
  defaultPlayBillingRange,
  fetchPlayBilling,
  markPlayBillingPaid,
  type PlayBillingItem,
  type PlayBillingResponse,
  type PlayBillingTab,
} from "@/lib/play-billing-client";
import { publishLiveEvent } from "@/lib/live-events";
import { fetchResourceCatalog, type ResourceCatalog } from "@/lib/resources-client";
import { useLiveData } from "@/lib/use-live-data";
import { useVenueHref } from "@/lib/venue-context";
import { useVenueSettings } from "@/lib/venue-settings-context";
import { PlayBillingEditDialog } from "./play-billing-edit-dialog";

const PAGE_SIZE = 8;

const TABS: {
  id: PlayBillingTab;
  label: string;
  hint: string;
}[] = [
  {
    id: "in_progress",
    label: "In progress",
    hint: "Guest is playing now (checked in or within their booked time). Price updates as time passes.",
  },
  {
    id: "awaiting_payment",
    label: "Awaiting payment",
    hint: "Session finished but not paid yet. Mark paid when you collect — amount is final from the booking length.",
  },
  {
    id: "paid",
    label: "Paid",
    hint: "Already collected. Filter by date to review past days, weeks, or months.",
  },
];

function formatSchedule(startsAt: string, endsAt: string) {
  return formatEventWindow(startsAt, endsAt) ?? "—";
}

export function PlayBillingPanel({ canWrite }: { canWrite: boolean }) {
  const { formatMoney } = useVenueSettings();
  const sessionsHref = useVenueHref("/sessions?tab=schedule");
  const gamingHref = useVenueHref("/resources");
  const defaultRange = defaultPlayBillingRange();

  const [tab, setTab] = useState<PlayBillingTab>("in_progress");
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [data, setData] = useState<PlayBillingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<PlayBillingItem | null>(null);
  const [catalog, setCatalog] = useState<ResourceCatalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);

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
          }),
        );
      } catch (e) {
        if (!opts?.silent) {
          setError(
            e instanceof Error ? e.message : "Could not load play billing.",
          );
        }
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [tab, from, to],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(0);
  }, [tab, from, to]);

  useLiveData(() => load({ silent: true }), [tab, from, to], {
    intervalMs: 20_000,
    refreshOnSections: ["finance", "reservation", "operations"],
  });

  const allItems = useMemo(() => data?.items ?? [], [data?.items]);
  const pageCount = Math.max(1, Math.ceil(allItems.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = useMemo(
    () =>
      allItems.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    [allItems, safePage],
  );

  const fullDayMap = useMemo(() => {
    const m = new Map<string, { totalDue: number; totalPaid: number; count: number }>();
    for (const d of data?.days ?? []) {
      m.set(d.day, {
        totalDue: d.totalDue,
        totalPaid: d.totalPaid,
        count: d.items.length,
      });
    }
    return m;
  }, [data?.days]);

  const pageDayGroups = useMemo(() => {
    if (tab === "in_progress") return [];
    const byDay: Record<
      string,
      {
        day: string;
        items: PlayBillingItem[];
        totalDue: number;
        totalPaid: number;
        dayTotalCount: number;
      }
    > = {};
    for (const item of pageItems) {
      const day = item.startsAt.slice(0, 10);
      const full = fullDayMap.get(day);
      if (!byDay[day]) {
        byDay[day] = {
          day,
          items: [],
          totalDue: full?.totalDue ?? 0,
          totalPaid: full?.totalPaid ?? 0,
          dayTotalCount: full?.count ?? 0,
        };
      }
      byDay[day].items.push(item);
    }
    return Object.values(byDay).sort((a, b) => b.day.localeCompare(a.day));
  }, [pageItems, tab, fullDayMap]);

  const activeTabHint = TABS.find((t) => t.id === tab)?.hint;

  async function openEdit(item: PlayBillingItem) {
    if (!canWrite) return;
    setEditing(item);
    if (!catalog) {
      setCatalogLoading(true);
      try {
        setCatalog(await fetchResourceCatalog());
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not load gaming units.",
        );
        setEditing(null);
      } finally {
        setCatalogLoading(false);
      }
    }
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
      await markPlayBillingPaid(item.id);
      publishLiveEvent({ section: "finance" });
      publishLiveEvent({ section: "reservation" });
      await load({ silent: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not mark paid.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-white/10 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-400">
        Charges come from{" "}
        <Link href={sessionsHref} className="text-emerald-400 underline">
          game reservations
        </Link>
        . Prices use rates from{" "}
        <Link href={gamingHref} className="text-emerald-400 underline">
          Gaming setup
        </Link>
        . Staff marks paid when collected; use Edit to change game, time, party, or
        custom charge, or mark no-show if the guest did not arrive.
      </div>

      {data?.summary ? (
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full border border-sky-400/25 bg-sky-500/10 px-2.5 py-0.5 text-sky-200">
            {data.summary.inProgress} in progress
          </span>
          <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-0.5 text-amber-200">
            {data.summary.awaitingPayment} awaiting payment
          </span>
          <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-0.5 text-emerald-200">
            {data.summary.paid} paid in range
          </span>
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
          <label className="text-xs text-zinc-500">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-500">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 block rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-white"
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

      {error ? (
        <p className="text-sm text-rose-300">{error}</p>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-7 animate-spin text-emerald-400" />
        </div>
      ) : tab !== "in_progress" && pageDayGroups.length > 0 ? (
        <div className="space-y-6">
          {pageDayGroups.map((group) => (
            <section key={group.day}>
              <header className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
                <h3 className="text-sm font-semibold text-white">
                  {new Date(group.day + "T12:00:00").toLocaleDateString(
                    undefined,
                    {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    },
                  )}
                </h3>
                <span className="text-[11px] text-zinc-500">
                  {group.items.length} on this page
                  {group.dayTotalCount > group.items.length
                    ? ` · ${group.dayTotalCount} total that day`
                    : ""}
                  {tab === "paid" || tab === "awaiting_payment" ? (
                    <>
                      {" "}
                      · day{" "}
                      {tab === "paid"
                        ? formatMoney(group.totalPaid)
                        : formatMoney(group.totalDue)}{" "}
                      {tab === "paid" ? "collected" : "due"}
                    </>
                  ) : null}
                </span>
              </header>
              <ul className="space-y-2">
                {group.items.map((item) => (
                  <PlayBillingRow
                    key={item.id}
                    item={item}
                    canWrite={canWrite}
                    busy={busyId === item.id}
                    formatMoney={formatMoney}
                    onMarkPaid={() => void onMarkPaid(item)}
                    onEdit={() => void openEdit(item)}
                  />
                ))}
              </ul>
            </section>
          ))}
          <PlayBillingPagination
            page={safePage}
            pageCount={pageCount}
            total={allItems.length}
            onPageChange={setPage}
          />
        </div>
      ) : allItems.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/15 p-10 text-center text-sm text-zinc-500">
          {tab === "in_progress"
            ? "No games in use right now. Check in a booking from Reservations."
            : "No bookings in this period."}
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {pageItems.map((item) => (
              <PlayBillingRow
                key={item.id}
                item={item}
                canWrite={canWrite}
                busy={busyId === item.id}
                formatMoney={formatMoney}
                onMarkPaid={() => void onMarkPaid(item)}
                onEdit={() => void openEdit(item)}
              />
            ))}
          </ul>
          <PlayBillingPagination
            page={safePage}
            pageCount={pageCount}
            total={allItems.length}
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
        <PlayBillingEditDialog
          item={editing}
          catalog={catalog}
          onClose={() => setEditing(null)}
          onSaved={onEditSaved}
        />
      ) : null}
    </div>
  );
}

function PlayBillingPagination({
  page,
  pageCount,
  total,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPageChange: (p: number) => void;
}) {
  if (total <= PAGE_SIZE) return null;
  const start = page * PAGE_SIZE + 1;
  const end = Math.min((page + 1) * PAGE_SIZE, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-xs">
      <span className="text-zinc-500">
        Showing {start}–{end} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 0}
          onClick={() => onPageChange(page - 1)}
          className="rounded-lg border border-white/10 p-1.5 text-zinc-400 hover:bg-white/5 disabled:opacity-30"
          aria-label="Previous page"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="min-w-[3.5rem] text-center text-zinc-400">
          {page + 1} / {pageCount}
        </span>
        <button
          type="button"
          disabled={page >= pageCount - 1}
          onClick={() => onPageChange(page + 1)}
          className="rounded-lg border border-white/10 p-1.5 text-zinc-400 hover:bg-white/5 disabled:opacity-30"
          aria-label="Next page"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

function PlayBillingRow({
  item,
  canWrite,
  busy,
  formatMoney,
  onMarkPaid,
  onEdit,
}: {
  item: PlayBillingItem;
  canWrite: boolean;
  busy: boolean;
  formatMoney: (n: number) => string;
  onMarkPaid: () => void;
  onEdit: () => void;
}) {
  const amount = item.isPaid ? (item.billedAmount ?? 0) : item.computedAmount;
  return (
    <li
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3",
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
          <span className="text-[11px] font-normal text-zinc-500">
            · {item.resource.name}
            {item.resource.categoryName
              ? ` (${item.resource.categoryName})`
              : ""}
          </span>
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
          <CalendarRange size={12} />
          {formatSchedule(item.startsAt, item.endsAt)}
          <span>·</span>
          <Clock size={12} />
          {item.durationMinutes} min
          <span>·</span>
          {item.partySize} guest{item.partySize > 1 ? "s" : ""}
        </p>
        <p className="mt-1 text-[11px] text-zinc-600">
          {item.breakdown} · {item.rateLabel}
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
          {item.isPaid ? (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-emerald-400/90">
              <Check size={12} />
              Paid
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
          ) : (
            <span className="text-[10px] text-zinc-600">Unpaid</span>
          )}
        </div>
      </div>
    </li>
  );
}
