"use client";

import { Loader2, Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  createGuestCheck,
  fetchGuestChecks,
  type GuestCheck,
} from "@/lib/guest-check-client";
import { formatCheckoutMoney } from "./checkout-presenter";
import { CheckoutDrawer } from "./checkout-drawer";
import { SettlementStatus } from "./settlement-status";

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
      setError(loadError instanceof Error ? loadError.message : "Could not load open checks.");
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

  if (!canRead) {
    return <SettlementStatus issue="unauthorized" />;
  }

  if (loading && checks.length === 0) {
    return (
      <div className="flex min-h-[18rem] items-center justify-center gap-2 rounded-2xl border border-white/8 bg-zinc-950/60 text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading checks…
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
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-200"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  if (checks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/40 px-5 py-16 text-center">
        <p className="text-base font-semibold text-zinc-200">No open checks</p>
        <p className="mt-2 text-sm text-zinc-500">
          Start a new check here. Play, orders, and bookings can then flow into the same checkout.
        </p>
        {canWrite ? (
          <button
            type="button"
            onClick={() => void onCreateCheck()}
            disabled={creating}
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:opacity-50"
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
    <div className="grid min-h-[34rem] flex-1 gap-4 xl:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="min-h-0 rounded-2xl border border-white/8 bg-zinc-950/55 p-3">
        <div className="mb-3 flex items-center justify-between gap-2 px-1">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Open checks
            </p>
            <p className="mt-1 text-xs text-zinc-600">{checks.length} available</p>
          </div>
          <div className="flex items-center gap-1">
            {canWrite ? (
              <button
                type="button"
                title="New check"
                onClick={() => void onCreateCheck()}
                disabled={creating}
                className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/5 hover:text-emerald-300 disabled:opacity-40"
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
              className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200 disabled:opacity-40"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
        <ul className="max-h-[68vh] space-y-1 overflow-y-auto">
          {checks.map((check) => {
            const active = check.id === selected.id;
            const currency = check.currency ?? "PLN";
            return (
              <li key={check.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(check.id)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                    active
                      ? "border-emerald-400/25 bg-emerald-400/10"
                      : "border-transparent bg-white/[0.02] hover:border-white/8 hover:bg-white/[0.04]"
                  }`}
                >
                  <p className={`truncate text-sm font-semibold ${active ? "text-emerald-100" : "text-zinc-200"}`}>
                    {check.label?.trim() || check.guestName?.trim() || "Guest check"}
                  </p>
                  <p className="mt-1 truncate text-xs text-zinc-500">
                    {check.guestName?.trim() || `Check ${check.id.slice(0, 8)}`}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                    <span>v{check.version}</span>
                    <span className="tabular-nums">
                      {formatCheckoutMoney(check.runningTotal, currency, locale)}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <CheckoutDrawer
        key={`${selected.id}:${selected.version}`}
        checkId={selected.id}
        expectedVersion={selected.version}
        checkLabel={selected.label?.trim() || selected.guestName}
        canWrite={canWrite}
        locale={locale}
      />
    </div>
  );
}
