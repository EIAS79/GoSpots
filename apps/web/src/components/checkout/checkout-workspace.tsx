"use client";

import { Loader2, Plus, RefreshCw, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [newCheckOpen, setNewCheckOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [label, setLabel] = useState("");
  const [partySize, setPartySize] = useState(1);

  const loadChecks = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetchGuestChecks("OPEN");
      setChecks(response.checks);
      setSelectedId((current) => {
        if (current && response.checks.some((check) => check.id === current)) {
          return current;
        }
        return response.checks[0]?.id ?? null;
      });
    } catch (loadErrorValue) {
      setLoadError(
        loadErrorValue instanceof Error
          ? loadErrorValue.message
          : "Could not load open checks.",
      );
    } finally {
      setLoading(false);
    }
  }, [canRead]);

  useEffect(() => {
    void loadChecks();
  }, [loadChecks]);

  async function onCreateCheck(event?: FormEvent) {
    event?.preventDefault();
    if (!canWrite || creating) return;
    setCreating(true);
    setActionError(null);
    try {
      const created = await createGuestCheck({
        guestName: guestName.trim() || undefined,
        label: label.trim() || undefined,
        partySize,
      });
      setGuestName("");
      setLabel("");
      setPartySize(1);
      setNewCheckOpen(false);
      await loadChecks();
      setSelectedId(created.id);
    } catch (createError) {
      setActionError(
        createError instanceof Error
          ? createError.message
          : "Could not create a new check.",
      );
    } finally {
      setCreating(false);
    }
  }

  if (!canRead) return <SettlementStatus issue="unauthorized" />;

  if (loading && checks.length === 0 && !loadError) {
    return (
      <div className="flex min-h-[22rem] items-center justify-center gap-2 rounded-2xl border border-white/8 bg-zinc-950/60 text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading checkout…
      </div>
    );
  }

  if (loadError && checks.length === 0) {
    return (
      <div className="space-y-3">
        <SettlementStatus issue="error" detail={loadError} />
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
      <div className="rounded-2xl border border-dashed border-white/10 bg-zinc-950/45 px-5 py-14 text-center">
        <p className="text-lg font-semibold text-zinc-100">No open checks</p>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-zinc-500">
          A guest check is one customer or group bill. Create it, attach their play,
          orders, or booking, finalize the amount, then take payment.
        </p>
        {canWrite ? (
          <div className="mx-auto mt-6 max-w-xl text-left">
            {newCheckOpen ? (
              <NewCheckForm
                guestName={guestName}
                label={label}
                partySize={partySize}
                creating={creating}
                error={actionError}
                onGuestName={setGuestName}
                onLabel={setLabel}
                onPartySize={setPartySize}
                onCancel={() => {
                  setNewCheckOpen(false);
                  setActionError(null);
                }}
                onSubmit={onCreateCheck}
              />
            ) : (
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setNewCheckOpen(true)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-400 px-5 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-emerald-300"
                >
                  <Plus className="h-4 w-4" />
                  New guest check
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  const selected = checks.find((check) => check.id === selectedId) ?? checks[0];

  return (
    <div className="grid min-h-[32rem] min-w-0 rounded-2xl border border-white/10 bg-zinc-950/45 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="min-w-0 border-b border-white/8 bg-black/15 p-3 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-9rem)] lg:self-start lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-2 px-1">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Open checks
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              {checks.length} active · one bill per guest/group
            </p>
          </div>
          <div className="flex items-center gap-1">
            {canWrite ? (
              <button
                type="button"
                title="New guest check"
                aria-label="New guest check"
                onClick={() => {
                  setNewCheckOpen((current) => !current);
                  setActionError(null);
                }}
                className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-400 text-zinc-950 transition hover:bg-emerald-300"
              >
                {newCheckOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              </button>
            ) : null}
            <button
              type="button"
              title="Refresh checks"
              aria-label="Refresh checks"
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

        {newCheckOpen && canWrite ? (
          <div className="mt-3">
            <NewCheckForm
              guestName={guestName}
              label={label}
              partySize={partySize}
              creating={creating}
              error={actionError}
              compact
              onGuestName={setGuestName}
              onLabel={setLabel}
              onPartySize={setPartySize}
              onCancel={() => {
                setNewCheckOpen(false);
                setActionError(null);
              }}
              onSubmit={onCreateCheck}
            />
          </div>
        ) : null}

        {loadError ? (
          <div className="mt-3 rounded-lg border border-amber-400/15 bg-amber-400/[0.05] px-2.5 py-2 text-[11px] leading-4 text-amber-200">
            Refresh failed. Existing checks are kept on screen.
          </div>
        ) : null}

        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:max-h-[calc(100dvh-18rem)] lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:overscroll-contain lg:pr-1">
          {checks.map((check) => {
            const active = check.id === selected.id;
            const sources = sourceCount(check);
            return (
              <li key={check.id} className="min-w-[13rem] lg:min-w-0">
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
                      `Check #${check.id.slice(0, 8)}`}
                  </p>
                  <p className="mt-1 truncate text-xs text-zinc-500">
                    {check.guestName?.trim() || "Walk-in / unnamed guest"}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500">
                    <span>
                      {check.partySize} guest{check.partySize === 1 ? "" : "s"}
                    </span>
                    <span>·</span>
                    <span>
                      {sources} source{sources === 1 ? "" : "s"}
                    </span>
                  </div>
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

function NewCheckForm({
  guestName,
  label,
  partySize,
  creating,
  error,
  compact = false,
  onGuestName,
  onLabel,
  onPartySize,
  onCancel,
  onSubmit,
}: {
  guestName: string;
  label: string;
  partySize: number;
  creating: boolean;
  error: string | null;
  compact?: boolean;
  onGuestName: (value: string) => void;
  onLabel: (value: string) => void;
  onPartySize: (value: number) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent) => Promise<void>;
}) {
  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      className={`rounded-xl border border-white/10 bg-black/20 ${compact ? "p-3" : "p-4"}`}
    >
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-400">
        New guest check
      </p>
      <p className="mt-1 text-[11px] leading-4 text-zinc-600">
        Guest name and label are optional, but using one makes busy shifts much easier.
      </p>
      <div className={`mt-3 grid gap-2 ${compact ? "" : "sm:grid-cols-3"}`}>
        <label className="text-[11px] font-medium text-zinc-500">
          Guest name
          <input
            value={guestName}
            onChange={(event) => onGuestName(event.target.value)}
            placeholder="e.g. Anna"
            className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-zinc-950/80 px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-400/40"
          />
        </label>
        <label className="text-[11px] font-medium text-zinc-500">
          Check label
          <input
            value={label}
            onChange={(event) => onLabel(event.target.value)}
            placeholder="e.g. Table 5"
            className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-zinc-950/80 px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-400/40"
          />
        </label>
        <label className="text-[11px] font-medium text-zinc-500">
          Guests
          <input
            type="number"
            min={1}
            max={99}
            value={partySize}
            onChange={(event) =>
              onPartySize(Math.min(99, Math.max(1, Number(event.target.value) || 1)))
            }
            className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-zinc-950/80 px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-400/40"
          />
        </label>
      </div>
      {error ? (
        <p className="mt-2 text-xs leading-5 text-rose-300">{error}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={creating}
          className="min-h-10 rounded-lg border border-white/10 px-3 text-xs font-semibold text-zinc-400 transition hover:bg-white/[0.04] disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={creating}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-400 px-3 text-xs font-bold text-zinc-950 transition hover:bg-emerald-300 disabled:opacity-50"
        >
          {creating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          Create check
        </button>
      </div>
    </form>
  );
}