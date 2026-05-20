"use client";

import { Gamepad2, Loader2, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { publishLiveEvent } from "@/lib/live-events";
import { useLiveData } from "@/lib/use-live-data";
import { cn } from "@/lib/cn";
import {
  createPlaySession,
  fetchPlaySessions,
  updatePlaySession,
  type PlaySession,
} from "@/lib/finance-client";
import {
  fetchResourceCatalog,
  type ResourceUnit,
} from "@/lib/resources-client";
import { useVenueSettings } from "@/lib/venue-settings-context";

type Tab = "ACTIVE" | "COMPLETED";

export function PlaySessionsPanel({ canWrite }: { canWrite: boolean }) {
  const { formatMoney } = useVenueSettings();
  const [tab, setTab] = useState<Tab>("ACTIVE");
  const [sessions, setSessions] = useState<PlaySession[]>([]);
  const [resources, setResources] = useState<ResourceUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [resourceId, setResourceId] = useState("");
  const [players, setPlayers] = useState("2");
  const [minutes, setMinutes] = useState("60");
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [resourceSearch, setResourceSearch] = useState("");

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    setError(null);
    try {
      const list = await fetchPlaySessions({ status: tab, archived: "exclude" });
      setSessions(list);
    } catch (e) {
      if (!opts?.silent) {
        setError(e instanceof Error ? e.message : "Could not load sessions.");
      }
    }
  }, [tab]);

  useEffect(() => {
    setLoading(true);
    void Promise.all([
      load().finally(() => setLoading(false)),
      fetchResourceCatalog()
        .then((c) =>
          setResources([
            ...c.uncategorized,
            ...c.categories.flatMap((cat) => cat.resources),
          ]),
        )
        .catch(() => setResources([])),
    ]);
  }, [load]);

  useLiveData(() => load({ silent: true }), [tab], {
    intervalMs: 20_000,
    refreshOnSections: ["finance", "operations", "shop_orders"],
  });

  const filteredResources = resources.filter((r) => {
    const q = resourceSearch.trim().toLowerCase();
    if (!q) return true;
    return `${r.name} ${r.type}`.toLowerCase().includes(q);
  });

  async function run<T>(fn: () => Promise<T>) {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
      throw e;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-400">
        Record billiard, PC, table, and game charges separately from menu orders.
        Set players, duration, and price — then mark completed when paid.
      </p>

      <div className="flex gap-2">
        {(["ACTIVE", "COMPLETED"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium",
              tab === t
                ? "bg-emerald-500/20 text-emerald-200"
                : "bg-white/5 text-zinc-400",
            )}
          >
            {t === "ACTIVE" ? "In progress" : "Completed"}
          </button>
        ))}
      </div>

      {canWrite ? (
        <form
          className="grid gap-3 rounded-xl border border-white/10 bg-zinc-900/40 p-4 sm:grid-cols-2 lg:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await createPlaySession({
                resourceId: resourceId || undefined,
                playerCount: Math.max(1, parseInt(players, 10) || 1),
                durationMinutes: parseInt(minutes, 10) || undefined,
                amount: parseFloat(amount) || 0,
                label: label.trim() || undefined,
              });
              setAmount("");
              setLabel("");
              setTab("ACTIVE");
              publishLiveEvent({ section: "finance" });
              await load({ silent: true });
            });
          }}
        >
          <div className="lg:col-span-2">
            <label className="block text-[11px] text-zinc-500">
              Table / game
              <div className="relative mt-1">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500"
                />
                <input
                  type="search"
                  value={resourceSearch}
                  onChange={(e) => setResourceSearch(e.target.value)}
                  placeholder="Search games & tables…"
                  className="w-full rounded border border-white/10 bg-zinc-950 py-1.5 pl-8 pr-2 text-sm text-white"
                />
              </div>
            </label>
            <select
              value={resourceId}
              onChange={(e) => setResourceId(e.target.value)}
              className="mt-2 w-full rounded border border-white/10 bg-zinc-950 px-2 py-1.5 text-sm text-white"
              size={Math.min(6, Math.max(3, filteredResources.length + 1))}
            >
              <option value="">— Optional —</option>
              {filteredResources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.type})
                </option>
              ))}
            </select>
          </div>
          <label className="block text-[11px] text-zinc-500">
            Players
            <input
              type="number"
              min={1}
              value={players}
              onChange={(e) => setPlayers(e.target.value)}
              className="mt-1 w-full rounded border border-white/10 bg-zinc-950 px-2 py-1.5 text-sm text-white"
            />
          </label>
          <label className="block text-[11px] text-zinc-500">
            Minutes
            <input
              type="number"
              min={1}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="mt-1 w-full rounded border border-white/10 bg-zinc-950 px-2 py-1.5 text-sm text-white"
            />
          </label>
          <label className="block text-[11px] text-zinc-500">
            Amount
            <input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded border border-white/10 bg-zinc-950 px-2 py-1.5 text-sm text-white"
            />
          </label>
          <label className="block text-[11px] text-zinc-500 lg:col-span-2">
            Label
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Walk-in, tournament…"
              className="mt-1 w-full rounded border border-white/10 bg-zinc-950 px-2 py-1.5 text-sm text-white"
            />
          </label>
          <div className="flex items-end lg:col-span-6">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              <Plus size={16} />
              Start session
            </button>
          </div>
        </form>
      ) : null}

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-emerald-400" />
        </div>
      ) : sessions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/15 p-8 text-center text-sm text-zinc-500">
          No {tab === "ACTIVE" ? "active" : "completed"} play sessions.
        </p>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-zinc-950/50 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm text-white">
                  <Gamepad2 size={14} className="text-emerald-400" />
                  {s.label || s.resource?.name || "Play session"}
                </p>
                <p className="text-xs text-zinc-500">
                  {s.playerCount} players
                  {s.durationMinutes ? ` · ${s.durationMinutes} min` : ""}
                  {s.resource?.name ? ` · ${s.resource.name}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-emerald-300">
                  {formatMoney(s.amount)}
                </span>
                {canWrite && s.status === "ACTIVE" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await updatePlaySession(s.id, { status: "COMPLETED" });
                        publishLiveEvent({ section: "finance" });
                        await load({ silent: true });
                      })
                    }
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-500"
                  >
                    Mark paid
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
