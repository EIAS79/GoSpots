"use client";

import {
  Archive,
  ChefHat,
  Filter,
  Loader2,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/api";
import { OrderDetailPanel } from "@/components/finance/order-detail-panel";
import { OrderGridCard } from "@/components/finance/order-grid-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ModalPortal } from "@/components/ui/modal-portal";
import {
  addShopOrderLine,
  archiveShopOrders,
  createShopOrder,
  deleteShopOrder,
  deleteShopOrderLine,
  fetchShopOrders,
  fetchTopSellers,
  patchShopOrderLine,
  unarchiveShopOrders,
  updateShopOrder,
  type SalesByItem,
  type ShopOrder,
} from "@/lib/finance-client";
import { fetchMenu, type FullMenu } from "@/lib/menu-client";
import { orderMetaDraftMatches } from "@/lib/order-display-label";
import { publishLiveEvent } from "@/lib/live-events";
import { useLiveData } from "@/lib/use-live-data";
import { useVenueSettings } from "@/lib/venue-settings-context";

type ConfirmState =
  | null
  | {
      kind: "cancelOrder" | "deleteOrder" | "deleteLine";
      lineId?: string;
    };

type Tab = "PENDING" | "COMPLETED" | "CANCELED" | "ARCHIVED";

const ORDERS_PER_PAGE = 6;

const TABS: {
  id: Tab;
  label: string;
  icon: typeof ChefHat;
}[] = [
  { id: "PENDING", label: "Preparing", icon: ChefHat },
  { id: "COMPLETED", label: "Handed off", icon: PackageCheck },
  { id: "CANCELED", label: "Canceled", icon: XCircle },
  { id: "ARCHIVED", label: "Archived", icon: Archive },
];

function orderMatchesTab(order: ShopOrder, tab: Tab): boolean {
  if (tab === "ARCHIVED") return order.archivedAt != null;
  if (order.archivedAt) return false;
  return order.status === tab;
}

export function MenuOrdersPanel({
  canWrite,
}: {
  canWrite: boolean;
}) {
  const { formatMoney } = useVenueSettings();
  const [tab, setTab] = useState<Tab>("PENDING");
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [menu, setMenu] = useState<FullMenu | null>(null);
  const [selected, setSelected] = useState<ShopOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [labelDraft, setLabelDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [payDraft, setPayDraft] = useState("CASH");
  const [pendingConfirm, setPendingConfirm] = useState<ConfirmState>(null);
  const [guestDraft, setGuestDraft] = useState("1");
  const [tableReservedDraft, setTableReservedDraft] = useState(false);
  const [reservationFeeDraft, setReservationFeeDraft] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [orderPage, setOrderPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [topSellers, setTopSellers] = useState<SalesByItem[]>([]);
  const [metaAutosave, setMetaAutosave] = useState<
    "idle" | "pending" | "saving" | "saved"
  >("idle");
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");
  const loadGen = useRef(0);

  const loadOrders = useCallback(
    async (
      tabOverride?: Tab,
      opts?: { silent?: boolean },
    ): Promise<ShopOrder[]> => {
      const t = tabOverride ?? tab;
      const gen = ++loadGen.current;
      if (!opts?.silent) setError(null);
      try {
        const list = await fetchShopOrders({
          status: t === "ARCHIVED" ? "ALL" : t,
          archived: t === "ARCHIVED" ? "only" : "exclude",
          from: filterFrom || undefined,
          to: filterTo || undefined,
          q: searchQ || undefined,
          take: 80,
        });
        const filtered = list.filter((o) => orderMatchesTab(o, t));
        if (gen !== loadGen.current) return filtered;
        setOrders(filtered);
        setSelectedIds((prev) => {
          if (prev.size === 0) return prev;
          const next = new Set<string>();
          for (const id of prev) {
            if (filtered.some((o) => o.id === id)) next.add(id);
          }
          return next;
        });
        setSelected((cur) => {
          if (!cur) return null;
          const next = filtered.find((o) => o.id === cur.id);
          return next ?? null;
        });
        return filtered;
      } catch (e) {
        if (gen !== loadGen.current) return [];
        if (opts?.silent && e instanceof ApiError && e.status === 401) {
          return [];
        }
        if (e instanceof ApiError && e.status === 401) {
          setError("Session expired. Refresh the page or sign in again.");
        } else {
          setError(
            e instanceof Error ? e.message : "Could not load orders.",
          );
        }
        return [];
      }
    },
    [tab, filterFrom, filterTo, searchQ],
  );

  const mainTabs = TABS.filter((t) => t.id !== "ARCHIVED");
  const archivedTab = TABS.find((t) => t.id === "ARCHIVED")!;

  const displayOrders = useMemo(
    () => orders.filter((o) => orderMatchesTab(o, tab)),
    [orders, tab],
  );

  const orderPageCount = Math.max(
    1,
    Math.ceil(displayOrders.length / ORDERS_PER_PAGE),
  );
  const safeOrderPage = Math.min(orderPage, orderPageCount - 1);
  const pageOrders = displayOrders.slice(
    safeOrderPage * ORDERS_PER_PAGE,
    safeOrderPage * ORDERS_PER_PAGE + ORDERS_PER_PAGE,
  );

  const hasDateFilter = Boolean(filterFrom || filterTo);

  useEffect(() => {
    const id = window.setTimeout(() => setSearchQ(searchDraft.trim()), 350);
    return () => window.clearTimeout(id);
  }, [searchDraft]);

  useEffect(() => {
    setOrderPage(0);
  }, [tab, filterFrom, filterTo, searchQ, displayOrders.length]);

  useEffect(() => {
    if (!selectionMode) setSelectedIds(new Set());
  }, [selectionMode]);

  useEffect(() => {
    void fetchMenu()
      .then(setMenu)
      .catch(() => setMenu(null));
    void fetchTopSellers(30, 10).then(setTopSellers).catch(() => setTopSellers([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    void loadOrders().finally(() => setLoading(false));
  }, [loadOrders]);

  useLiveData(
    async () => {
      await loadOrders(undefined, { silent: true });
    },
    [tab, filterFrom, filterTo, searchQ],
    {
      intervalMs: 20_000,
      refreshOnSections: ["shop_orders", "operations", "finance"],
    },
  );

  useEffect(() => {
    if (!selected) {
      setLabelDraft("");
      setNoteDraft("");
      setPayDraft("CASH");
      setGuestDraft("1");
      setTableReservedDraft(false);
      setReservationFeeDraft("");
      setMetaAutosave("idle");
      return;
    }
    setLabelDraft(selected.label ?? "");
    setNoteDraft(selected.note ?? "");
    setPayDraft(selected.paymentMethod ?? "CASH");
    setGuestDraft(String(selected.guestCount ?? 1));
    setTableReservedDraft(Boolean(selected.tableReserved));
    setReservationFeeDraft(
      selected.tableReserved && selected.reservationFee != null
        ? String(selected.reservationFee)
        : "",
    );
    setMetaAutosave("idle");
  }, [
    selected?.id,
    selected?.label,
    selected?.note,
    selected?.paymentMethod,
    selected?.guestCount,
    selected?.tableReserved,
    selected?.reservationFee,
  ]);

  useEffect(() => {
    if (!selected || !canWrite) return;
    if (
      tab === "ARCHIVED" ||
      selected.archivedAt ||
      selected.status === "CANCELED"
    ) {
      return;
    }
    if (
      orderMetaDraftMatches(
        selected,
        labelDraft,
        noteDraft,
        payDraft,
        guestDraft,
        tableReservedDraft,
        reservationFeeDraft,
      )
    ) {
      setMetaAutosave((s) => (s === "pending" ? "idle" : s));
      return;
    }

    setMetaAutosave("pending");
    const orderId = selected.id;
    const timer = window.setTimeout(() => {
      setMetaAutosave("saving");
      const feeRaw = reservationFeeDraft.trim();
      void updateShopOrder(orderId, {
        label: labelDraft.trim() || null,
        note: noteDraft.trim() || null,
        paymentMethod: payDraft,
        guestCount: parseInt(guestDraft, 10) || 1,
        tableReserved: tableReservedDraft,
        reservationFee:
          tableReservedDraft && feeRaw !== ""
            ? Math.max(0, parseFloat(feeRaw) || 0)
            : null,
      })
        .then((next) => {
          mergeSelected(next);
          setMetaAutosave((s) => (s === "saving" ? "saved" : s));
          window.setTimeout(() => {
            setMetaAutosave((s) => (s === "saved" ? "idle" : s));
          }, 2000);
        })
        .catch((e) => {
          setError(e instanceof Error ? e.message : "Could not save ticket.");
          setMetaAutosave("idle");
        });
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [
    labelDraft,
    noteDraft,
    payDraft,
    guestDraft,
    tableReservedDraft,
    reservationFeeDraft,
    selected?.id,
    selected?.archivedAt,
    selected?.status,
    canWrite,
    tab,
  ]);

  async function refreshMenu() {
    try {
      setMenu(await fetchMenu());
    } catch {
      /* keep prior menu */
    }
  }

  async function run<T>(fn: () => Promise<T>) {
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      publishLiveEvent({ section: "finance" });
      publishLiveEvent({ section: "shop_orders" });
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  function mergeSelected(next: ShopOrder) {
    setSelected((cur) => (cur?.id === next.id ? next : cur));
    setOrders((list) => {
      if (!orderMatchesTab(next, tab)) {
        return list.filter((o) => o.id !== next.id);
      }
      const has = list.some((o) => o.id === next.id);
      if (!has) return [next, ...list];
      return list.map((o) => (o.id === next.id ? next : o));
    });
  }

  const activeLineCount = selected
    ? selected.lines.filter(
        (l) => l.lineStatus === "ACTIVE" && l.quantity > 0,
      ).length
    : 0;
  const canHandToCustomer =
    selected?.status === "PENDING" && activeLineCount > 0;

  const allGridSelected =
    displayOrders.length > 0 &&
    displayOrders.every((o) => selectedIds.has(o.id));

  function toggleSelectAll() {
    if (allGridSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayOrders.map((o) => o.id)));
    }
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  function selectOrder(order: ShopOrder) {
    setSelected(order);
    setMobileView("detail");
  }

  return (
    <div className="flex min-h-0 flex-col gap-4 lg:min-h-[min(78vh,720px)]">
      {topSellers.length > 0 ? (
        <div className="shrink-0 rounded-xl border border-white/10 bg-zinc-900/40 px-3 py-2">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Top sellers · 30 days
          </p>
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            {topSellers.map((item, i) => (
              <div
                key={item.menuItemId ?? item.name}
                className="flex shrink-0 items-center gap-2 rounded-lg bg-zinc-950/60 px-2.5 py-1.5 ring-1 ring-white/10"
              >
                <span className="text-[10px] font-bold text-zinc-600">#{i + 1}</span>
                <span className="max-w-[120px] truncate text-xs text-zinc-200">
                  {item.name}
                </span>
                <span className="text-xs tabular-nums text-emerald-300">
                  {item.quantity} · {formatMoney(item.revenue)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-5">
        <section
          className={cn(
            "flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/50 shadow-xl shadow-black/20",
            mobileView === "detail" && "hidden lg:flex",
          )}
        >
          <header className="shrink-0 space-y-3 border-b border-white/10 p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-white">Orders</h2>
                <p className="text-[11px] text-zinc-500">{displayOrders.length} in view</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {canWrite ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const o = await createShopOrder({});
                        setTab("PENDING");
                        const list = await loadOrders("PENDING");
                        const created = list.find((x) => x.id === o.id) ?? o;
                        setSelected(created);
                        setMobileView("detail");
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    <Plus size={15} />
                    New
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy || loading}
                  onClick={() => void loadOrders()}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-2 text-xs text-zinc-300 hover:bg-white/5"
                >
                  <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                </button>
              </div>
            </div>

            <label className="relative block">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <input
                type="search"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder="Search table or guest…"
                className="w-full rounded-xl border border-white/10 bg-zinc-950/80 py-2.5 pl-9 pr-9 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
              />
              {searchDraft ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearchDraft("")}
                  className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-zinc-500 hover:bg-white/5"
                >
                  ×
                </button>
              ) : null}
            </label>

            <div className="flex gap-2">
              <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-xl bg-zinc-950/80 p-1 ring-1 ring-white/10 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {mainTabs.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={cn(
                      "inline-flex shrink-0 items-center justify-center gap-1 rounded-lg px-2.5 py-2 text-[11px] font-medium sm:flex-1 sm:px-2",
                      tab === id
                        ? "bg-emerald-500/20 text-emerald-100"
                        : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300",
                    )}
                  >
                    <Icon size={13} className="shrink-0 opacity-80" />
                    <span className="whitespace-nowrap">{label}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setTab("ARCHIVED")}
                title={archivedTab.label}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-xl border px-2.5 py-2 text-[10px] font-medium sm:px-3 sm:text-[11px]",
                  tab === "ARCHIVED"
                    ? "border-violet-400/40 bg-violet-500/15 text-violet-100"
                    : "border-white/10 bg-zinc-950/60 text-zinc-500 hover:border-white/20 hover:text-zinc-300",
                )}
              >
                <archivedTab.icon size={13} className="shrink-0 opacity-80" />
                <span className="hidden sm:inline">{archivedTab.label}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="hidden min-w-0 flex-1 items-center gap-2 md:flex">
                <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-zinc-600">
                  Dates
                </span>
                <input
                  type="date"
                  value={filterFrom}
                  onChange={(e) => setFilterFrom(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-zinc-950 px-2 py-1.5 text-xs text-white"
                  aria-label="From date"
                />
                <span className="text-zinc-600">–</span>
                <input
                  type="date"
                  value={filterTo}
                  onChange={(e) => setFilterTo(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-zinc-950 px-2 py-1.5 text-xs text-white"
                  aria-label="To date"
                />
                {hasDateFilter ? (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterFrom("");
                      setFilterTo("");
                    }}
                    className="shrink-0 text-[11px] text-zinc-500 hover:text-zinc-300"
                  >
                    Clear
                  </button>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs md:hidden",
                  hasDateFilter
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                    : "border-white/10 text-zinc-400 hover:bg-white/5",
                )}
              >
                <Filter size={14} />
                Date range
                {hasDateFilter ? (
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                ) : null}
              </button>

              {canWrite && displayOrders.length > 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    selectionMode ? exitSelectionMode() : setSelectionMode(true)
                  }
                  className={cn(
                    "ml-auto inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium",
                    selectionMode
                      ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                      : "border-white/10 text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
                  )}
                >
                  {selectionMode ? "Done" : "Select"}
                </button>
              ) : null}
            </div>

            {selectionMode && canWrite ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2.5">
                <p className="text-xs text-zinc-400">
                  <span className="font-semibold text-white">
                    {selectedIds.size}
                  </span>{" "}
                  selected
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-zinc-300 hover:bg-white/5"
                  >
                    {allGridSelected ? "Clear all" : "Select all"}
                  </button>
                  {selectedIds.size > 0 ? (
                    tab === "ARCHIVED" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await unarchiveShopOrders([...selectedIds]);
                            exitSelectionMode();
                            await loadOrders("ARCHIVED");
                          })
                        }
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                      >
                        Unarchive
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await archiveShopOrders([...selectedIds]);
                            exitSelectionMode();
                            await loadOrders();
                          })
                        }
                        className="rounded-lg bg-violet-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                      >
                        Archive
                      </button>
                    )
                  ) : null}
                  <button
                    type="button"
                    onClick={exitSelectionMode}
                    className="rounded-lg border border-white/15 px-2.5 py-1.5 text-[11px] text-zinc-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            {error ? <p className="text-xs text-rose-300">{error}</p> : null}
          </header>

          <div className="relative min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            <div className="max-h-[min(48vh,400px)] overflow-y-auto pr-0.5">
          {loading ? (
            <div className="flex justify-center py-12 text-zinc-500">
              <Loader2 className="size-8 animate-spin" />
            </div>
          ) : displayOrders.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/15 p-8 text-center text-sm text-zinc-500">
              No orders in this view.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {pageOrders.map((o) => (
                  <OrderGridCard
                    key={o.id}
                    order={o}
                    selected={selected?.id === o.id}
                    checked={selectedIds.has(o.id)}
                    selectionMode={selectionMode}
                    formatMoney={formatMoney}
                    onSelect={() => selectOrder(o)}
                    onToggleCheck={() => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(o.id)) next.delete(o.id);
                        else next.add(o.id);
                        return next;
                      });
                    }}
                  />
                ))}
              </div>
              {displayOrders.length > ORDERS_PER_PAGE ? (
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/5 pt-3">
                  <span className="text-[11px] text-zinc-500">
                    {safeOrderPage * ORDERS_PER_PAGE + 1}–
                    {Math.min(
                      (safeOrderPage + 1) * ORDERS_PER_PAGE,
                      displayOrders.length,
                    )}{" "}
                    of {displayOrders.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={safeOrderPage <= 0}
                      onClick={() => setOrderPage((p) => Math.max(0, p - 1))}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-zinc-300 disabled:opacity-40"
                      aria-label="Previous page"
                    >
                      ‹
                    </button>
                    <span className="min-w-[3rem] text-center text-[11px] tabular-nums text-zinc-400">
                      {safeOrderPage + 1} / {orderPageCount}
                    </span>
                    <button
                      type="button"
                      disabled={safeOrderPage >= orderPageCount - 1}
                      onClick={() =>
                        setOrderPage((p) => Math.min(orderPageCount - 1, p + 1))
                      }
                      className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-zinc-300 disabled:opacity-40"
                      aria-label="Next page"
                    >
                      ›
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
            </div>
          </div>
        </section>

        <section
          className={cn(
            "flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/50 shadow-xl shadow-black/20 lg:min-h-[min(52vh,440px)]",
            mobileView === "list" && "hidden lg:flex",
          )}
        >
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <PackageCheck className="mb-3 size-10 text-zinc-600" />
            <p className="text-sm font-medium text-zinc-400">No ticket selected</p>
            <p className="mt-1 max-w-xs text-xs text-zinc-600">
              Pick a card from the grid or start a new order.
            </p>
          </div>
        ) : (
          <OrderDetailPanel
            selected={selected}
            tab={tab}
            canWrite={canWrite}
            busy={busy}
            menu={menu}
            labelDraft={labelDraft}
            setLabelDraft={setLabelDraft}
            noteDraft={noteDraft}
            setNoteDraft={setNoteDraft}
            payDraft={payDraft}
            setPayDraft={setPayDraft}
            guestDraft={guestDraft}
            setGuestDraft={setGuestDraft}
            tableReservedDraft={tableReservedDraft}
            setTableReservedDraft={setTableReservedDraft}
            reservationFeeDraft={reservationFeeDraft}
            setReservationFeeDraft={setReservationFeeDraft}
            formatMoney={formatMoney}
            canHandToCustomer={canHandToCustomer}
            metaAutosave={metaAutosave}
            onBack={() => setMobileView("list")}
            onDeleteOrder={() => setPendingConfirm({ kind: "deleteOrder" })}
            onCancelOrder={() => setPendingConfirm({ kind: "cancelOrder" })}
            onHandOff={() =>
              void run(async () => {
                const next = await updateShopOrder(selected.id, {
                  status: "COMPLETED",
                });
                setTab("COMPLETED");
                const list = await loadOrders("COMPLETED");
                setSelected(list.find((x) => x.id === next.id) ?? next);
              })
            }
            onBackToPreparing={() =>
              void run(async () => {
                const next = await updateShopOrder(selected.id, {
                  status: "PENDING",
                });
                setTab("PENDING");
                const list = await loadOrders("PENDING");
                setSelected(list.find((x) => x.id === next.id) ?? next);
              })
            }
            onAddLine={(itemId, qty) =>
              void run(async () => {
                const next = await addShopOrderLine(selected.id, {
                  menuItemId: itemId,
                  quantity: qty,
                });
                mergeSelected(next);
                await refreshMenu();
              })
            }
            onLineQty={(lineId, q) =>
              void run(async () => {
                const next = await patchShopOrderLine(selected.id, lineId, {
                  quantity: q,
                });
                mergeSelected(next);
              })
            }
            onLinePrice={(lineId, p) =>
              void run(async () => {
                const next = await patchShopOrderLine(selected.id, lineId, {
                  unitPrice: p,
                });
                mergeSelected(next);
              })
            }
            onRemoveLine={(lineId) =>
              setPendingConfirm({ kind: "deleteLine", lineId })
            }
            onRestoreLine={(lineId) =>
              void run(async () => {
                const next = await patchShopOrderLine(selected.id, lineId, {
                  lineStatus: "ACTIVE",
                });
                mergeSelected(next);
              })
            }
          />
        )}
      </section>
    </div>

      <ConfirmDialog
        open={pendingConfirm?.kind === "cancelOrder"}
        title="Cancel this order?"
        description="All lines will be marked canceled. Stock for active lines will be restored."
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
        variant="danger"
        busy={busy}
        onCancel={() => setPendingConfirm(null)}
        onConfirm={() => {
          if (!selected) return;
          void run(async () => {
            const next = await updateShopOrder(selected.id, {
              status: "CANCELED",
            });
            setPendingConfirm(null);
            setTab("CANCELED");
            const list = await loadOrders("CANCELED");
            setSelected(list.find((x) => x.id === next.id) ?? next);
            await refreshMenu();
          });
        }}
      />
      <ConfirmDialog
        open={pendingConfirm?.kind === "deleteOrder"}
        title="Delete order permanently?"
        description="This will remove the current order from data and history. This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Keep"
        variant="danger"
        busy={busy}
        onCancel={() => setPendingConfirm(null)}
        onConfirm={() => {
          if (!selected) return;
          void run(async () => {
            await deleteShopOrder(selected.id);
            setPendingConfirm(null);
            setSelected(null);
            await loadOrders();
            await refreshMenu();
          });
        }}
      />
      <ConfirmDialog
        open={pendingConfirm?.kind === "deleteLine"}
        title="Remove line?"
        description="This line will be removed from the order. Stock will be restored if applicable."
        confirmLabel="Remove"
        cancelLabel="Keep"
        variant="danger"
        busy={busy}
        onCancel={() => setPendingConfirm(null)}
        onConfirm={() => {
          if (!selected || !pendingConfirm?.lineId) return;
          const lineId = pendingConfirm.lineId;
          void run(async () => {
            const next = await deleteShopOrderLine(selected.id, lineId);
            setPendingConfirm(null);
            mergeSelected(next);
            await refreshMenu();
          });
        }}
      />

      {filtersOpen ? (
        <ModalPortal>
          <div className="fixed inset-0 z-[400] flex items-end justify-center sm:items-center sm:p-4">
            <button
              type="button"
              aria-label="Close filters"
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setFiltersOpen(false)}
            />
            <div className="relative z-10 w-full max-w-md overflow-hidden rounded-t-2xl border border-white/10 bg-zinc-950 shadow-2xl sm:rounded-2xl">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <h3 className="text-sm font-semibold text-white">Date range</h3>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-white/5"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <div className="space-y-3 p-5">
                <label className="block text-xs text-zinc-500">
                  From
                  <input
                    type="date"
                    value={filterFrom}
                    onChange={(e) => setFilterFrom(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                  />
                </label>
                <label className="block text-xs text-zinc-500">
                  To
                  <input
                    type="date"
                    value={filterTo}
                    onChange={(e) => setFilterTo(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                  />
                </label>
              </div>
              <div className="flex gap-2 border-t border-white/10 p-4">
                <button
                  type="button"
                  onClick={() => {
                    setFilterFrom("");
                    setFilterTo("");
                  }}
                  className="flex-1 rounded-lg border border-white/15 py-2.5 text-sm text-zinc-300 hover:bg-white/5"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-500"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </div>
  );
}
