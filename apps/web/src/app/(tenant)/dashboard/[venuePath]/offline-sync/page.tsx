"use client";

import { useCallback, useEffect, useState } from "react";
import { TenantPage } from "@/components/layout/tenant-page";
import { useConnectivity } from "@/lib/connectivity-context";
import {
  discardOfflineOperation,
  listOfflineOperations,
  retryOfflineOperation,
  type OfflineOperationRecord,
} from "@/lib/offline-outbox";

export default function OfflineSyncPage() {
  const connectivity = useConnectivity();
  const [rows, setRows] = useState<OfflineOperationRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await listOfflineOperations());
      setError(null);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : "Could not load offline operations.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, connectivity.pending, connectivity.conflict, connectivity.failed]);

  async function syncNow() {
    setBusy(true);
    try {
      await connectivity.syncNow();
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function retry(row: OfflineOperationRecord) {
    await retryOfflineOperation(row.key);
    await connectivity.refreshOfflineCounts();
    if (connectivity.browserOnline) await connectivity.syncNow();
    await load();
  }

  async function discard(row: OfflineOperationRecord) {
    if (row.state === "SYNCED") return;
    await discardOfflineOperation(row.key);
    await connectivity.refreshOfflineCounts();
    await load();
  }

  const unresolved = rows.filter((row) => row.state !== "SYNCED");

  return (
    <TenantPage
      title="Offline sync"
      description="Review work created during WAN loss. Conflicts are never auto-overwritten."
      capabilities={[
        "Stable operation IDs prevent duplicate replay",
        "Version conflicts require operator review",
        "Financial, card, refund and KSeF actions stay online-only",
      ]}
    >
      <div className="space-y-4">
        <section className="rounded-xl border border-white/10 bg-zinc-950/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">
                {connectivity.browserOnline ? "Connection available" : "Working offline"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {connectivity.pending} pending · {connectivity.conflict} conflicts · {connectivity.failed} failed
              </p>
            </div>
            <button
              type="button"
              onClick={() => void syncNow()}
              disabled={!connectivity.browserOnline || busy}
              className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-bold text-emerald-950 disabled:opacity-40"
            >
              {busy ? "Syncing…" : "Sync now"}
            </button>
          </div>
        </section>

        {error ? (
          <div className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{error}</div>
        ) : null}

        {unresolved.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.025] p-6 text-sm text-zinc-400">
            No offline work needs review.
          </div>
        ) : (
          <div className="space-y-2">
            {unresolved.map((row) => (
              <article key={row.key} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{row.operationType.replaceAll("_", " ")}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {row.entityId} · expected v{row.expectedVersion ?? "new"} · attempts {row.syncAttempts}
                    </p>
                  </div>
                  <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] font-semibold text-zinc-300">
                    {row.state}
                  </span>
                </div>
                {row.lastSyncError ? (
                  <p className="mt-3 rounded-lg bg-black/20 px-3 py-2 text-xs leading-5 text-amber-100">
                    {row.lastSyncCode ? `${row.lastSyncCode}: ` : ""}{row.lastSyncError}
                  </p>
                ) : null}
                <div className="mt-3 flex gap-2">
                  {(row.state === "CONFLICT" || row.state === "FAILED") ? (
                    <button type="button" onClick={() => void retry(row)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/5">
                      Retry same operation
                    </button>
                  ) : null}
                  {row.state !== "SYNCING" ? (
                    <button type="button" onClick={() => void discard(row)} className="rounded-lg border border-red-400/20 px-3 py-1.5 text-xs text-red-200 hover:bg-red-400/10">
                      Discard local operation
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </TenantPage>
  );
}
