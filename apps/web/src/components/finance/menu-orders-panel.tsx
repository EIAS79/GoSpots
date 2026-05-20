"use client";

import {
  Archive,
  ChefHat,
  ChevronDown,
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
import { OrderDetailPanel } from "@/components/finance/order-detail-panel";
import { OrderGridCard } from "@/components/finance/order-grid-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
      kind: "cancelOrder" | "deleteOrder" | "deleteLine" | "cancelLine";
      lineId?: string;
    };

type Tab = "PENDING" | "COMPLETED" | "CANCELED" | "ARCHIVED";

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
  const [filterQ, setFilterQ] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [topSellers, setTopSellers] = useState<SalesByItem[]>([]);
  const [metaAutosave, setMetaAutosave] = useState<
    "idle" | "pending" | "saving" | "saved"
  >("idle");
  const loadGen = useRef(0);

  const loadOrders = useCallback(
    async (tabOverride?: Tab): Promise<ShopOrder[]> => {
      const t = tabOverride ?? tab;
      const gen = ++loadGen.current;
      setError(null);
      try {
        const list = await fetchShopOrders({
          status: t === "ARCHIVED" ? "ALL" : t,
          archived: t === "ARCHIVED" ? "only" : "exclude",
          from: filterFrom || undefined,
          to: filterTo || undefined,
          q: filterQ.trim() || undefined,
          take: 80,
        });
        const filtered = list.filter((o) => orderMatchesTab(o, t));
        if (gen !== loadGen.current) return filtered;
        setOrders(filtered);
        setSelectedIds(new Set());
        setSelected((cur) => {
          if (!cur) return null;
          const next = filtered.find((o) => o.id === cur.id);
          return next ?? null;
        });
        return filtered;
      } catch (e) {
        if (gen === loadGen.current) {
          setError(e instanceof Error ? e.message : "Could not load orders.");
        }
        return [];
      }
    },
    [tab, filterFrom, filterTo, filterQ],
  );

  const displayOrders = useMemo(
    () => orders.filter((o) => orderMatchesTab(o, tab)),
    [orders, tab],
  );

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
      await loadOrders();
    },
    [tab, filterFrom, filterTo, filterQ],
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
      throw e;
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

  return (
    <div className="flex min-h-[min(78vh,720px)] flex-col gap-4">
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
        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/50 shadow-xl shadow-black/20">
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
                        setSelected(list.find((x) => x.id === o.id) ?? o);
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

            <div className="flex flex-wrap gap-1 rounded-xl bg-zinc-950/80 p-1 ring-1 ring-white/10">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={cn(
                    "inline-flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-medium sm:flex-none sm:px-3",
                    tab === id
                      ? "bg-emerald-500/20 text-emerald-100"
                      : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300",
                  )}
                >
                  <Icon size={14} className="shrink-0 opacity-80" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setFiltersOpen((o) => !o)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs",
                  filtersOpen
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                    : "border-white/10 text-zinc-400 hover:bg-white/5",
                )}
              >
                <Filter size={14} />
                Filters
                <ChevronDown
                  size={14}
                  className={cn("transition-transform", filtersOpen && "rotate-180")}
                />
              </button>
              {canWrite && displayOrders.length > 0 ? (
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-zinc-500">
                  <input
                    type="checkbox"
                    checked={allGridSelected}
                    onChange={toggleSelectAll}
                    className="size-3.5 rounded border-white/20"
                  />
                  Select all
                </label>
              ) : null}
            </div>

            {filtersOpen ? (
              <div className="grid gap-2 rounded-lg border border-white/10 bg-zinc-950/60 p-3 sm:grid-cols-3">
                <label className="block text-[11px] text-zinc-500">
                  From
                  <input
                    type="date"
                    value={filterFrom}
                    onChange={(e) => setFilterFrom(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-xs text-white"
                  />
                </label>
                <label className="block text-[11px] text-zinc-500">
                  To
                  <input
                    type="date"
                    value={filterTo}
                    onChange={(e) => setFilterTo(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-xs text-white"
                  />
                </label>
                <label className="block text-[11px] text-zinc-500">
                  <span className="inline-flex items-center gap-1">
                    <Search size={12} />
                    Search
                  </span>
                  <input
                    value={filterQ}
                    onChange={(e) => setFilterQ(e.target.value)}
                    placeholder="Table, guest…"
                    className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-xs text-white"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setLoading(true);
                    void loadOrders().finally(() => setLoading(false));
                  }}
                  className="sm:col-span-3 text-xs font-medium text-emerald-400 hover:text-emerald-300"
                >
                  Apply filters
                </button>
              </div>
            ) : null}

            {error ? <p className="text-xs text-rose-300">{error}</p> : null}

            {canWrite && selectedIds.size > 0 ? (
              <div className="flex flex-wrap gap-2">
                {tab === "ARCHIVED" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await unarchiveShopOrders([...selectedIds]);
                        await loadOrders("ARCHIVED");
                      })
                    }
                    className="rounded-lg border border-emerald-400/30 px-3 py-1.5 text-xs text-emerald-200"
                  >
                    Unarchive ({selectedIds.size})
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await archiveShopOrders([...selectedIds]);
                        await loadOrders();
                      })
                    }
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-300"
                  >
                    Archive ({selectedIds.size})
                  </button>
                )}
              </div>
            ) : null}
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
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
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {displayOrders.map((o) => (
                <OrderGridCard
                  key={o.id}
                  order={o}
                  selected={selected?.id === o.id}
                  checked={selectedIds.has(o.id)}
                  showCheckbox={canWrite}
                  formatMoney={formatMoney}
                  onSelect={() => setSelected(o)}
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
          )}
            </div>
          </div>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/50 shadow-xl shadow-black/20 lg:min-h-[min(52vh,440px)]">
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
            onCancelLine={(lineId) =>
              setPendingConfirm({ kind: "cancelLine", lineId })
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
      <ConfirmDialog
        open={pendingConfirm?.kind === "cancelLine"}
        title="Cancel this line?"
        description="The line will be marked canceled and stock restored."
        confirmLabel="Cancel line"
        cancelLabel="Keep"
        variant="danger"
        busy={busy}
        onCancel={() => setPendingConfirm(null)}
        onConfirm={() => {
          if (!selected || !pendingConfirm?.lineId) return;
          const lineId = pendingConfirm.lineId;
          void run(async () => {
            const next = await patchShopOrderLine(selected.id, lineId, {
              lineStatus: "CANCELED",
            });
            setPendingConfirm(null);
            mergeSelected(next);
            await refreshMenu();
          });
        }}
      />
    </div>
  );
}
