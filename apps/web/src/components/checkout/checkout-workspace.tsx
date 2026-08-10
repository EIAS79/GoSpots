"use client";

import { Loader2, Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  createGuestCheck,
  fetchGuestChecks,
  type GuestCheck,
} from "@/lib/guest-check-client";
import { CheckoutDrawer } from "./checkout-drawer";
import { SettlementStatus } from "./settlement-status";

function sourceCount(check: GuestCheck) {
  return (
    check.shopOrders.length + check.playSessions.length + check.reservations.length
  );
}

export function CheckoutWorkspace({
  canRead,
  canWrite,
  locale = "en",
}: {
  canRead: boolean;
  canWrite: boolean;
  locale?: string;
}) {
  const [checks, setChecks] = useState<GuestCheck[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(canRead);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadChecks = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetchGuestChecks("OPEN");
      setChecks(response.checks);
      setSelectedId((current) => {
        if (current && response.checks.some((check) => check.id === current)) {
          return current;
        }
        return response.checks[0]?.id ?? null;
      });
    } catch (loadError) {
      setChecks([]);
      setSelectedId(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load open checks.",
      );
    } finally {
      setLoading(false);
    }
  }, [canRead]);

  useEffect(() => {
    void loadChecks();
  }, [loadChecks]);

  async function onCreateCheck() {
    if (!canWrite || creating) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createGuestCheck({});
      await loadChecks();
      setSelectedId(created.id);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Could not create a new check.",
      );
    } finally {
      setCreating(false);
    }
  }

  if (!canRead) return <SettlementStatus issue="unauthorized" />;

  if (loading && checks.length === 0) {
    return (
      <div className="flex min-h-[22rem] items-center justify-center gap-2 rounded-2xl border border-white/8 bg-zinc-950/60 text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading checkout…
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <SettlementStatus issue="error" detail={error} />
        <button
          type="button"
          onClick={() => void loadChecks()}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/[0.08]"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  if (checks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-zinc-950/45 px-5 py-20 text-center">
        <p className="text-lg font-semibold text-zinc-100">No open checks</p>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-zinc-500">
          Create a check, then add menu items or attach an existing reservation,
          order, or play session from the same screen.
        </p>
        {canWrite ? (
          <button
            type="button"
            onClick={() => void onCreateCheck()}
            disabled={creating}
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-400 px-5 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-emerald-300 disabled:opacity-50"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            New check
          </button>
        ) : null}
      </div>
    );
  }

  const selected = checks.find((check) => check.id === selectedId) ?? checks[0];

  return (
    <div className="grid h-full min-h-[32rem] flex-1 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/45 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col border-b border-white/8 bg-black/15 p-3 lg:border-b-0 lg:border-r">
        <div className="mb-3 flex items-center justify-between gap-2 px-1">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Open checks
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              {checks.length} active
            </p>
          </div>
          <div className="flex items-center gap-1">
            {canWrite ? (
              <button
                type="button"
                title="New check"
                onClick={() => void onCreateCheck()}
                disabled={creating}
                className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-400 text-zinc-950 transition hover:bg-emerald-300 disabled:opacity-40"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </button>
            ) : null}
            <button
              type="button"
              title="Refresh checks"
              onClick={() => void loadChecks()}
              disabled={loading}
              className="grid h-9 w-9 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200 disabled:opacity-40"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </div>

        <ul className="flex min-h-0 gap-2 overflow-x-auto lg:flex-1 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:overscroll-contain lg:pr-1">
          {checks.map((check) => {
            const active = check.id === selected.id;
            const sources = sourceCount(check);
            return (
              <li key={check.id} className="min-w-[12rem] lg:min-w-0">
                <button
                  type="button"
                  onClick={() => setSelectedId(check.id)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                    active
                      ? "border-emerald-400/35 bg-emerald-400/10 shadow-[inset_3px_0_0_rgba(52,211,153,0.8)]"
                      : "border-white/5 bg-white/[0.025] hover:border-white/10 hover:bg-white/[0.05]"
                  }`}
                >
                  <p
                    className={`truncate text-sm font-semibold ${
                      active ? "text-emerald-100" : "text-zinc-200"
                    }`}
                  >
                    {check.label?.trim() ||
                      check.guestName?.trim() ||
                      "Guest check"}
                  </p>
                  <p className="mt-1 truncate text-xs text-zinc-500">
                    {check.guestName?.trim() || `#${check.id.slice(0, 8)}`}
                  </p>
                  <p className="mt-2 text-xs font-medium text-zinc-400">
                    {check.partySize} guest{check.partySize === 1 ? "" : "s"} · {sources}{" "}
                    source{sources === 1 ? "" : "s"}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <CheckoutDrawer
        key={selected.id}
        check={selected}
        canWrite={canWrite}
        locale={locale}
        onCheckChanged={loadChecks}
      />
    </div>
  );
}
