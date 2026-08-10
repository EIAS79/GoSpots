"use client";

import { ArrowLeftRight, Loader2, Merge, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  mergeGuestChecks,
  moveGuestCheckCharges,
} from "@/lib/checkout-client";
import {
  fetchGuestChecks,
  type GuestCheck,
} from "@/lib/guest-check-client";
import { formatCheckoutMoney } from "./checkout-presenter";

type Direction = "INTO_CURRENT" | "OUT_OF_CURRENT";
type MoveKind = "orders" | "play" | "reservations";

function checkName(check: GuestCheck) {
  return (
    check.label?.trim() ||
    check.guestName?.trim() ||
    `Check #${check.id.slice(0, 8)}`
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Unable to update these checks.";
}

export function CheckMergePanel({
  currentCheck,
  locked = false,
  locale = "en",
  onChanged,
  onClose,
}: {
  currentCheck: GuestCheck;
  locked?: boolean;
  locale?: string;
  onChanged: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [checks, setChecks] = useState<GuestCheck[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [direction, setDirection] = useState<Direction>("INTO_CURRENT");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadChecks() {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchGuestChecks("OPEN");
      const others = result.checks.filter((check) => check.id !== currentCheck.id);
      setChecks(others);
      setSelectedId((current) =>
        others.some((check) => check.id === current)
          ? current
          : (others[0]?.id ?? ""),
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadChecks();
    // currentCheck.id is the stable boundary for reopening the panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCheck.id]);

  const other = checks.find((check) => check.id === selectedId) ?? null;
  const source = direction === "INTO_CURRENT" ? other : currentCheck;
  const destination = direction === "INTO_CURRENT" ? currentCheck : other;

  const sources = useMemo(() => {
    if (!source) return [];
    return [
      ...source.shopOrders.map((order) => ({
        key: `order:${order.id}`,
        id: order.id,
        kind: "orders" as MoveKind,
        title: order.label?.trim() || `Order #${order.id.slice(0, 8)}`,
        subtitle: order.status,
        amount: order.total,
      })),
      ...source.playSessions.map((session) => ({
        key: `play:${session.id}`,
        id: session.id,
        kind: "play" as MoveKind,
        title: session.label?.trim() || `Play #${session.id.slice(0, 8)}`,
        subtitle: session.status,
        amount: session.amount,
      })),
      ...source.reservations.map((reservation) => ({
        key: `reservation:${reservation.id}`,
        id: reservation.id,
        kind: "reservations" as MoveKind,
        title:
          reservation.guestName?.trim() ||
          `Booking #${reservation.id.slice(0, 8)}`,
        subtitle: reservation.status,
        amount: reservation.billedAmount ?? "0.0000",
      })),
    ];
  }, [source]);

  useEffect(() => {
    setSelected(new Set());
  }, [direction, selectedId]);

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleMerge() {
    if (!source || !destination || locked || busy) return;
    setBusy(true);
    setError(null);
    try {
      await mergeGuestChecks(destination.id, {
        sourceCheckId: source.id,
        expectedDestinationVersion: destination.version,
        expectedSourceVersion: source.version,
      });
      await onChanged();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      await loadChecks();
    } finally {
      setBusy(false);
    }
  }

  async function handleMove() {
    if (!source || !destination || locked || busy || selected.size === 0) return;
    const shopOrderIds: string[] = [];
    const playSessionIds: string[] = [];
    const reservationIds: string[] = [];
    for (const item of sources) {
      if (!selected.has(item.key)) continue;
      if (item.kind === "orders") shopOrderIds.push(item.id);
      if (item.kind === "play") playSessionIds.push(item.id);
      if (item.kind === "reservations") reservationIds.push(item.id);
    }

    setBusy(true);
    setError(null);
    try {
      await moveGuestCheckCharges(source.id, {
        destinationCheckId: destination.id,
        expectedSourceVersion: source.version,
        expectedDestinationVersion: destination.version,
        shopOrderIds,
        playSessionIds,
        reservationIds,
      });
      await onChanged();
      await loadChecks();
      setSelected(new Set());
    } catch (err) {
      setError(errorMessage(err));
      await loadChecks();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black/40">
      <div className="flex items-start justify-between gap-4 border-b border-white/8 p-4">
        <div className="flex gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-400/10 text-sky-300">
            <Merge className="h-5 w-5" />
          </span>
          <div>
            <h3 className="font-bold text-white">Merge or move charges</h3>
            <p className="mt-1 max-w-xl text-xs leading-5 text-zinc-500">
              Combine two open checks, or move selected orders, play sessions and
              reservations between them. Paid checks cannot be rearranged.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-white"
          aria-label="Close merge panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 p-4">
        {locked ? (
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.07] px-3 py-2.5 text-xs leading-5 text-amber-200">
            This check already has a recorded payment. Finish it as-is; charges
            cannot be moved after payment allocation starts.
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setDirection("INTO_CURRENT")}
            className={`rounded-xl border p-3 text-left transition ${
              direction === "INTO_CURRENT"
                ? "border-sky-400/45 bg-sky-400/10"
                : "border-white/8 bg-white/[0.025]"
            }`}
          >
            <span className="text-sm font-semibold text-zinc-100">
              Bring into this check
            </span>
            <span className="mt-1 block text-[11px] text-zinc-500">
              Another check is the source; {checkName(currentCheck)} receives it.
            </span>
          </button>
          <button
            type="button"
            onClick={() => setDirection("OUT_OF_CURRENT")}
            className={`rounded-xl border p-3 text-left transition ${
              direction === "OUT_OF_CURRENT"
                ? "border-sky-400/45 bg-sky-400/10"
                : "border-white/8 bg-white/[0.025]"
            }`}
          >
            <span className="text-sm font-semibold text-zinc-100">
              Send from this check
            </span>
            <span className="mt-1 block text-[11px] text-zinc-500">
              {checkName(currentCheck)} is the source; another open check receives it.
            </span>
          </button>
        </div>

        {loading ? (
          <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading open checks…
          </div>
        ) : checks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-zinc-500">
            There is no other open check to merge with.
          </div>
        ) : (
          <>
            <label className="block">
              <span className="text-xs font-semibold text-zinc-400">
                Other open check
              </span>
              <select
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white outline-none focus:border-sky-400/50"
              >
                {checks.map((check) => (
                  <option key={check.id} value={check.id}>
                    {checkName(check)} · {formatCheckoutMoney(
                      check.runningTotal,
                      check.currency ?? "PLN",
                      locale,
                    )}
                  </option>
                ))}
              </select>
            </label>

            <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Full merge
                  </p>
                  <p className="mt-1 text-xs leading-5 text-zinc-600">
                    Moves every attached charge. The source check is then voided
                    with permanent merge history.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={locked || busy || !source || !destination}
                  onClick={() => void handleMerge()}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-sky-400/30 bg-sky-400/10 px-3 text-xs font-bold text-sky-200 transition hover:bg-sky-400/15 disabled:opacity-40"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Merge className="h-4 w-4" />}
                  Merge all
                </button>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Move selected charges
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-600">
                    Source: {source ? checkName(source) : "—"}
                  </p>
                </div>
                {sources.length > 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setSelected(
                        selected.size === sources.length
                          ? new Set()
                          : new Set(sources.map((item) => item.key)),
                      )
                    }
                    className="text-xs font-semibold text-sky-300 hover:text-sky-200"
                  >
                    {selected.size === sources.length ? "Clear" : "Select all"}
                  </button>
                ) : null}
              </div>

              <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                {sources.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/8 px-4 py-6 text-center text-xs text-zinc-600">
                    The source check has no attached charge sources.
                  </div>
                ) : (
                  sources.map((item) => (
                    <label
                      key={item.key}
                      className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/7 bg-white/[0.02] px-3 py-2.5 hover:bg-white/[0.04]"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(item.key)}
                        onChange={() => toggle(item.key)}
                        className="h-4 w-4 accent-sky-400"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-200">
                          {item.title}
                        </p>
                        <p className="mt-0.5 text-[11px] uppercase tracking-wide text-zinc-600">
                          {item.kind} · {item.subtitle}
                        </p>
                      </div>
                      <span className="text-xs font-semibold tabular-nums text-zinc-400">
                        {formatCheckoutMoney(
                          item.amount,
                          source?.currency ?? "PLN",
                          locale,
                        )}
                      </span>
                    </label>
                  ))
                )}
              </div>

              <button
                type="button"
                disabled={locked || busy || selected.size === 0 || !source || !destination}
                onClick={() => void handleMove()}
                className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-sky-400 px-3 text-xs font-bold text-sky-950 transition hover:bg-sky-300 disabled:opacity-40"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowLeftRight className="h-4 w-4" />
                )}
                Move {selected.size || "selected"}
              </button>
            </div>
          </>
        )}

        {error ? (
          <div className="rounded-xl border border-red-400/20 bg-red-400/8 px-3 py-2.5 text-xs leading-5 text-red-200">
            {error}
          </div>
        ) : null}
      </div>
    </section>
  );
}
