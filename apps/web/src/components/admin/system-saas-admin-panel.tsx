"use client";

import { Loader2, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchSystemTenantDiagnostics,
  fetchSystemTenants,
  updateSystemTenantFeature,
  updateSystemTenantSubscription,
  type SystemTenant,
  type SystemTenantDiagnostics,
} from "@/lib/phase13-admin-client";

const TIERS = ["FREE", "STARTER", "STANDARD", "PRO", "ENTERPRISE"];
const STATUSES = ["TRIAL", "ACTIVE", "PAST_DUE", "PAUSED", "CANCELED"];
const FEATURE_KEYS = [
  "organizations_v1",
  "integrations_v1",
  "inventory_v2",
  "reservations_v2",
  "crm_v1",
  "loyalty_v1",
  "access_v1",
  "automation_v1",
  "ai_insights",
];

export function SystemSaasAdminPanel() {
  const [query, setQuery] = useState("");
  const [tenants, setTenants] = useState<SystemTenant[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<SystemTenantDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const selected = useMemo(
    () => tenants.find((tenant) => tenant.id === selectedId) ?? null,
    [tenants, selectedId],
  );

  const load = useCallback(async (search = "") => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchSystemTenants(search);
      setTenants(result.tenants);
      setSelectedId((current) =>
        current && result.tenants.some((tenant) => tenant.id === current)
          ? current
          : result.tenants[0]?.id ?? null,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load tenants.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedId) {
      setDiagnostics(null);
      return;
    }
    void fetchSystemTenantDiagnostics(selectedId)
      .then(setDiagnostics)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load diagnostics."));
  }, [selectedId]);

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    await load(query);
  }

  async function saveSubscription(input: Record<string, string | number>) {
    if (!selected) return;
    setSaving(true);
    setError(null);
    setNote(null);
    try {
      await updateSystemTenantSubscription(selected.id, input);
      setNote("Subscription entitlement updated and audited.");
      await load(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update subscription.");
    } finally {
      setSaving(false);
    }
  }

  async function setFeature(key: string, enabled: boolean) {
    if (!selected) return;
    setSaving(true);
    setError(null);
    setNote(null);
    try {
      await updateSystemTenantFeature(selected.id, { key, enabled });
      setNote(`${key} set to ${enabled ? "enabled" : "disabled"} and audited.`);
      await load(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update feature entitlement.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-violet-300">
            <ShieldCheck size={18} />
            <h2 className="font-semibold text-white">SaaS tenant control</h2>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-zinc-500">
            Search tenants, inspect service health, and manage manual plan/feature entitlements. Support access is diagnostics-only: this console does not impersonate venue users.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load(query)}
          disabled={loading || saving}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5 disabled:opacity-40"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Refresh
        </button>
      </div>

      <form onSubmit={onSearch} className="mt-4 flex gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, slug or email"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-400/60"
        />
        <button type="submit" className="inline-flex items-center gap-2 rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-sm text-violet-100">
          <Search size={14} /> Search
        </button>
      </form>

      {error ? <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
      {note ? <p className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{note}</p> : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(230px,0.8fr)_minmax(0,2fr)]">
        <div className="max-h-[34rem] overflow-auto rounded-xl border border-white/10 bg-zinc-950/60 p-2">
          {loading ? (
            <p className="p-3 text-sm text-zinc-500">Loading tenants…</p>
          ) : tenants.length === 0 ? (
            <p className="p-3 text-sm text-zinc-500">No tenants match this search.</p>
          ) : (
            tenants.map((tenant) => (
              <button
                type="button"
                key={tenant.id}
                onClick={() => setSelectedId(tenant.id)}
                className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm ${tenant.id === selectedId ? "bg-violet-500/15 text-violet-100" : "text-zinc-300 hover:bg-white/5"}`}
              >
                <span className="block truncate font-medium">{tenant.name}</span>
                <span className="block truncate text-xs text-zinc-500">/{tenant.slug}</span>
              </button>
            ))
          )}
        </div>

        {selected ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-zinc-950/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-medium text-white">{selected.name}</h3>
                  <p className="text-xs text-zinc-500">Tenant {selected.id}</p>
                </div>
                {selected.subscription?.billingSubscriptionId ? (
                  <span className="rounded border border-amber-400/30 px-2 py-1 text-xs text-amber-200">Provider-managed billing</span>
                ) : (
                  <span className="rounded border border-emerald-400/20 px-2 py-1 text-xs text-emerald-200">Manual entitlement</span>
                )}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <label className="text-xs text-zinc-400">
                  Tier
                  <select
                    value={selected.subscription?.tier ?? "STARTER"}
                    disabled={saving || Boolean(selected.subscription?.billingSubscriptionId)}
                    onChange={(event) => void saveSubscription({ tier: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-2 py-2 text-sm text-zinc-100"
                  >
                    {TIERS.map((value) => <option key={value}>{value}</option>)}
                  </select>
                </label>
                <label className="text-xs text-zinc-400">
                  Status
                  <select
                    value={selected.subscription?.status ?? "TRIAL"}
                    disabled={saving || Boolean(selected.subscription?.billingSubscriptionId)}
                    onChange={(event) => void saveSubscription({ status: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-2 py-2 text-sm text-zinc-100"
                  >
                    {STATUSES.map((value) => <option key={value}>{value}</option>)}
                  </select>
                </label>
                <label className="text-xs text-zinc-400">
                  Staff seats
                  <input
                    type="number"
                    min={0}
                    defaultValue={selected.subscription?.staffSeatQuantity ?? 0}
                    disabled={saving || Boolean(selected.subscription?.billingSubscriptionId)}
                    onBlur={(event) => void saveSubscription({ staffSeatQuantity: Math.max(0, Number(event.target.value) || 0) })}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-2 py-2 text-sm text-zinc-100"
                  />
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-zinc-950/60 p-4">
              <h3 className="text-sm font-medium text-white">Service diagnostics</h3>
              {diagnostics ? (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {Object.entries(diagnostics.counts).map(([key, value]) => (
                    <div key={key} className="rounded-lg border border-white/5 bg-zinc-900 p-2">
                      <div className="text-lg font-semibold tabular-nums text-zinc-100">{value}</div>
                      <div className="break-words text-[10px] text-zinc-500">{key}</div>
                    </div>
                  ))}
                </div>
              ) : <p className="mt-2 text-xs text-zinc-500">Loading diagnostics…</p>}
            </div>

            <div className="rounded-xl border border-white/10 bg-zinc-950/60 p-4">
              <h3 className="text-sm font-medium text-white">Feature entitlements</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {FEATURE_KEYS.map((key) => {
                  const enabled = selected.featureFlags.find((row) => row.feature === key)?.enabled ?? false;
                  return (
                    <label key={key} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 px-3 py-2 text-xs text-zinc-300">
                      <span>{key}</span>
                      <input type="checkbox" checked={enabled} disabled={saving} onChange={(event) => void setFeature(key, event.target.checked)} />
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
