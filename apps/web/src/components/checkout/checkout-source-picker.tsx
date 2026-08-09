"use client";

import {
  CalendarDays,
  Clock3,
  Loader2,
  PackagePlus,
  Search,
  ShoppingBag,
  Utensils,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  attachToGuestCheck,
  type GuestCheck,
} from "@/lib/guest-check-client";
import {
  addShopOrderLine,
  createShopOrder,
  fetchPlaySessions,
  fetchShopOrders,
  type PlaySession,
  type ShopOrder,
} from "@/lib/finance-client";
import { fetchMenu, type MenuItem } from "@/lib/menu-client";
import { fetchReservations, type Reservation } from "@/lib/reservations-client";
import { formatCheckoutMoney } from "./checkout-presenter";

type SourceTab = "menu" | "orders" | "reservations" | "play";

const TABS: Array<{
  id: SourceTab;
  label: string;
  icon: typeof Utensils;
}> = [
  { id: "menu", label: "Menu", icon: Utensils },
  { id: "orders", label: "Orders", icon: ShoppingBag },
  { id: "reservations", label: "Reservations", icon: CalendarDays },
  { id: "play", label: "Play sessions", icon: Clock3 },
];

function sourceErrorMessage(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Could not load this source.";
}

export function CheckoutSourcePicker({
  check,
  canWrite,
  locale,
  onChanged,
}: {
  check: GuestCheck;
  canWrite: boolean;
  locale: string;
  onChanged: () => Promise<void>;
}) {
  const [tab, setTab] = useState<SourceTab>("menu");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [playSessions, setPlaySessions] = useState<PlaySession[]>([]);

  const attachedOrderIds = useMemo(
    () => new Set(check.shopOrders.map((order) => order.id)),
    [check.shopOrders],
  );
  const attachedReservationIds = useMemo(
    () => new Set(check.reservations.map((reservation) => reservation.id)),
    [check.reservations],
  );
  const attachedPlayIds = useMemo(
    () => new Set(check.playSessions.map((session) => session.id)),
    [check.playSessions],
  );

  const loadTab = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === "menu") {
        const menu = await fetchMenu();
        setMenuItems(
          menu.items.filter(
            (item) => item.isAvailable && (!item.trackStock || item.stock > 0),
          ),
        );
      } else if (tab === "orders") {
        setOrders(await fetchShopOrders({ status: "PENDING", take: 80 }));
      } else if (tab === "reservations") {
        const result = await fetchReservations();
        setReservations(
          result.reservations.filter((reservation) =>
            ["PENDING", "CONFIRMED", "CHECKED_IN"].includes(reservation.status),
          ),
        );
      } else {
        setPlaySessions(await fetchPlaySessions({ status: "ACTIVE" }));
      }
    } catch (loadError) {
      setError(sourceErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    setQuery("");
    void loadTab();
  }, [loadTab]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleMenu = useMemo(
    () =>
      menuItems.filter((item) =>
        normalizedQuery
          ? `${item.name} ${item.description ?? ""}`
              .toLowerCase()
              .includes(normalizedQuery)
          : true,
      ),
    [menuItems, normalizedQuery],
  );
  const visibleOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          !attachedOrderIds.has(order.id) &&
          (normalizedQuery
            ? `${order.label ?? ""} ${order.note ?? ""} ${order.id}`
                .toLowerCase()
                .includes(normalizedQuery)
            : true),
      ),
    [orders, attachedOrderIds, normalizedQuery],
  );
  const visibleReservations = useMemo(
    () =>
      reservations.filter(
        (reservation) =>
          !attachedReservationIds.has(reservation.id) &&
          (normalizedQuery
            ? `${reservation.guestName} ${reservation.resource?.name ?? ""}`
                .toLowerCase()
                .includes(normalizedQuery)
            : true),
      ),
    [reservations, attachedReservationIds, normalizedQuery],
  );
  const visiblePlay = useMemo(
    () =>
      playSessions.filter(
        (session) =>
          !attachedPlayIds.has(session.id) &&
          (normalizedQuery
            ? `${session.label ?? ""} ${session.resource?.name ?? ""}`
                .toLowerCase()
                .includes(normalizedQuery)
            : true),
      ),
    [playSessions, attachedPlayIds, normalizedQuery],
  );

  async function addMenuItem(item: MenuItem) {
    if (!canWrite || busyId) return;
    setBusyId(item.id);
    setError(null);
    try {
      let orderId = check.shopOrders.find((order) => order.status === "PENDING")?.id;
      if (!orderId) {
        const created = await createShopOrder({
          label:
            check.label?.trim() ||
            check.guestName?.trim() ||
            `Checkout ${check.id.slice(0, 6)}`,
        });
        orderId = created.id;
        await addShopOrderLine(orderId, { menuItemId: item.id, quantity: 1 });
        await attachToGuestCheck(check.id, { shopOrderId: orderId });
      } else {
        await addShopOrderLine(orderId, { menuItemId: item.id, quantity: 1 });
      }
      await onChanged();
    } catch (actionError) {
      setError(sourceErrorMessage(actionError));
    } finally {
      setBusyId(null);
    }
  }

  async function attachOrder(orderId: string) {
    if (!canWrite || busyId) return;
    setBusyId(orderId);
    setError(null);
    try {
      await attachToGuestCheck(check.id, { shopOrderId: orderId });
      await onChanged();
      await loadTab();
    } catch (actionError) {
      setError(sourceErrorMessage(actionError));
    } finally {
      setBusyId(null);
    }
  }

  async function attachReservation(reservationId: string) {
    if (!canWrite || busyId) return;
    setBusyId(reservationId);
    setError(null);
    try {
      await attachToGuestCheck(check.id, { reservationId });
      await onChanged();
      await loadTab();
    } catch (actionError) {
      setError(sourceErrorMessage(actionError));
    } finally {
      setBusyId(null);
    }
  }

  async function attachPlaySession(playSessionId: string) {
    if (!canWrite || busyId) return;
    setBusyId(playSessionId);
    setError(null);
    try {
      await attachToGuestCheck(check.id, { playSessionId });
      await onChanged();
      await loadTab();
    } catch (actionError) {
      setError(sourceErrorMessage(actionError));
    } finally {
      setBusyId(null);
    }
  }

  const currency = check.currency ?? "PLN";

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
      <div className="border-b border-white/8 px-3 pt-3 sm:px-4 sm:pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">Add to check</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Add cashier items or attach an existing order, booking, or active session.
            </p>
          </div>
          <div className="relative min-w-[12rem] flex-1 sm:max-w-[18rem]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search"
              className="h-10 w-full rounded-xl border border-white/10 bg-black/20 pl-9 pr-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/40"
            />
          </div>
        </div>

        <div className="mt-3 flex gap-1 overflow-x-auto pb-3">
          {TABS.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-medium transition ${
                  active
                    ? "bg-emerald-400 text-zinc-950"
                    : "bg-white/[0.04] text-zinc-400 hover:bg-white/[0.07] hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-[13rem] max-h-[34vh] overflow-y-auto p-3 sm:p-4">
        {error ? (
          <div className="mb-3 rounded-xl border border-rose-400/20 bg-rose-400/[0.07] px-3 py-2 text-xs text-rose-100">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="flex min-h-[10rem] items-center justify-center gap-2 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : tab === "menu" ? (
          visibleMenu.length ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-3">
              {visibleMenu.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={!canWrite || busyId !== null}
                  onClick={() => void addMenuItem(item)}
                  className="group flex min-h-[5rem] items-center justify-between gap-3 rounded-xl border border-white/8 bg-zinc-950/55 px-3 py-3 text-left transition hover:border-emerald-400/30 hover:bg-emerald-400/[0.06] disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-100">
                      {item.name}
                    </p>
                    <p className="mt-1 text-xs font-medium tabular-nums text-emerald-300">
                      {formatCheckoutMoney(String(item.price), currency, locale)}
                    </p>
                  </div>
                  {busyId === item.id ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-300" />
                  ) : (
                    <PackagePlus className="h-4 w-4 shrink-0 text-zinc-600 transition group-hover:text-emerald-300" />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <EmptySource label="No available menu items found." />
          )
        ) : tab === "orders" ? (
          visibleOrders.length ? (
            <div className="space-y-2">
              {visibleOrders.map((order) => (
                <SourceRow
                  key={order.id}
                  title={order.label?.trim() || `Order ${order.id.slice(0, 8)}`}
                  subtitle={`${order.lines.filter((line) => line.lineStatus === "ACTIVE").length} line(s)`}
                  amount={formatCheckoutMoney(String(order.total), currency, locale)}
                  busy={busyId === order.id}
                  disabled={!canWrite || busyId !== null}
                  onClick={() => void attachOrder(order.id)}
                />
              ))}
            </div>
          ) : (
            <EmptySource label="No unattached pending orders found." />
          )
        ) : tab === "reservations" ? (
          visibleReservations.length ? (
            <div className="space-y-2">
              {visibleReservations.map((reservation) => (
                <SourceRow
                  key={reservation.id}
                  title={reservation.guestName}
                  subtitle={`${reservation.resource?.name ?? "Unassigned"} · ${new Date(reservation.startsAt).toLocaleString(locale)}`}
                  meta={reservation.status.replaceAll("_", " ")}
                  busy={busyId === reservation.id}
                  disabled={!canWrite || busyId !== null}
                  onClick={() => void attachReservation(reservation.id)}
                />
              ))}
            </div>
          ) : (
            <EmptySource label="No active reservations available to attach." />
          )
        ) : visiblePlay.length ? (
          <div className="space-y-2">
            {visiblePlay.map((session) => (
              <SourceRow
                key={session.id}
                title={
                  session.label?.trim() ||
                  session.resource?.name ||
                  `Session ${session.id.slice(0, 8)}`
                }
                subtitle={`${session.resource?.name ?? "Play session"} · ${session.playerCount} player(s)`}
                amount={formatCheckoutMoney(String(session.amount), currency, locale)}
                busy={busyId === session.id}
                disabled={!canWrite || busyId !== null}
                onClick={() => void attachPlaySession(session.id)}
              />
            ))}
          </div>
        ) : (
          <EmptySource label="No unattached active play sessions found." />
        )}
      </div>
    </section>
  );
}

function EmptySource({ label }: { label: string }) {
  return (
    <div className="flex min-h-[10rem] items-center justify-center rounded-xl border border-dashed border-white/10 px-4 text-center text-sm text-zinc-500">
      {label}
    </div>
  );
}

function SourceRow({
  title,
  subtitle,
  amount,
  meta,
  busy,
  disabled,
  onClick,
}: {
  title: string;
  subtitle: string;
  amount?: string;
  meta?: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/8 bg-zinc-950/55 px-3 py-3 text-left transition hover:border-emerald-400/30 hover:bg-emerald-400/[0.06] disabled:opacity-50"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-zinc-100">{title}</p>
          {meta ? (
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              {meta}
            </span>
          ) : null}
        </div>
        <p className="mt-1 truncate text-xs text-zinc-500">{subtitle}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {amount ? (
          <span className="text-sm font-semibold tabular-nums text-zinc-200">
            {amount}
          </span>
        ) : null}
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin text-emerald-300" />
        ) : (
          <span className="rounded-lg bg-emerald-400/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-300">
            Attach
          </span>
        )}
      </div>
    </button>
  );
}
