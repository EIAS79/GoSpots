'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

type Issue = {
  id: string;
  type: string;
  severity: string;
  amountMinor: number | null;
  currency: string | null;
  message: string;
  suggestedNextAction: string;
  evidenceLinks: string[];
  firstSeenAt: string;
  lastCheckedAt: string;
};

type AttentionItem = {
  id: string;
  domain: string;
  severity: string;
  title: string;
  detail: string;
  suggestedNextAction: string;
  evidenceLinks: string[];
};

type Workspace = {
  sourceVersion: string;
  context: {
    currency: string;
    timezone: string;
    businessDayStartMinutes: number;
    fromDate: string;
    toDate: string;
  };
  financial: {
    currencies: Array<{
      currency: string;
      grossSalesMinor: number;
      netSalesMinor: number;
      taxMinor: number;
      refundsMinor: number;
      discountsMinor: number;
      compsMinor: number;
      tipsMinor: number;
      serviceChargesMinor: number;
      averageCheckMinor: number | null;
      revenuePerElapsedHourMinor: number | null;
      providerVarianceMinor: number;
      cash: { expectedMinor: number; countedMinor: number; varianceMinor: number };
    }>;
  };
  resources: {
    utilizationPct: number | null;
    revenuePerAvailableResourceHourMinor: number | null;
    fbAttachRatePct: number | null;
    maintenanceDowntimeMinutes: number | null;
  };
  restaurant: {
    covers: number;
    tableTurns: number | null;
    averageSpendPerCoverMinor: number | null;
    voidRatePct: number | null;
    compRatePct: number | null;
    kds: { averagePrepSeconds: number | null; lateTicketCount: number; slaPct: number | null };
  };
  inventory: {
    cogsMinor: number;
    grossMarginMinor: number;
    grossMarginPct: number | null;
    daysOnHand: number | null;
    lowStockRisk: Array<{ stockItemId: string; name: string; quantityMilli: number; reorderLevelMilli: number }>;
  };
  reservations: {
    bookingVolume: number;
    conversionToSessionPct: number | null;
    noShowRatePct: number | null;
    cancellationRatePct: number | null;
    averageWaitMinutes: number | null;
  };
  customers: {
    newCustomers: number;
    returningCustomers: number;
    retentionPct: number | null;
    memberRevenueMinor: number;
    observedLtvMinor: number | null;
  };
  workforce: {
    laborHours: number | null;
    laborToSalesPct: number | null;
    laborCostMinor: number;
  };
  reconciliation: { clear: boolean; issueCount: number; checkedAt: string; issues: Issue[] };
  attention: { itemCount: number; generatedAt: string; items: AttentionItem[] };
};

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function money(minor: number | null | undefined, currency: string) {
  if (minor == null) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

function number(value: number | null | undefined, suffix = '') {
  return value == null ? '—' : `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)}${suffix}`;
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-50">{value}</div>
      {detail ? <div className="mt-1 text-xs text-slate-500">{detail}</div> : null}
    </div>
  );
}

function Severity({ value }: { value: string }) {
  return <span className="rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">{value}</span>;
}

export function Phase14OwnerIntelligence({ venuePath }: { venuePath: string }) {
  const today = useMemo(() => new Date(), []);
  const start = useMemo(() => {
    const value = new Date(today);
    value.setDate(value.getDate() - 29);
    return dateKey(value);
  }, [today]);
  const [fromDate, setFromDate] = useState(start);
  const [toDate, setToDate] = useState(dateKey(today));
  const [data, setData] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ fromDate, toDate });
      const result = await apiFetch<Workspace>(`/growth/analytics/phase14/workspace?${query.toString()}`);
      setData(result);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Unable to load owner intelligence.');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const primary = data?.financial.currencies.find((row) => row.currency === data.context.currency) ?? data?.financial.currencies[0];
  const currency = primary?.currency ?? data?.context.currency ?? 'PLN';

  return (
    <section className="space-y-5" aria-labelledby="phase14-owner-intelligence-title">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phase 14 · canonical facts</p>
          <h1 id="phase14-owner-intelligence-title" className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-50">Owner intelligence & reconciliation</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
            Financial, operational, inventory, reservation, customer and workforce KPIs share one business-day boundary and reconcile back to canonical GoSpots facts.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-500">From<input aria-label="Analytics from business date" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="mt-1 block rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700" /></label>
          <label className="text-xs text-slate-500">To<input aria-label="Analytics to business date" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="mt-1 block rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700" /></label>
          <button type="button" onClick={() => void load()} disabled={loading} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50 dark:border-slate-700">Refresh</button>
        </div>
      </div>

      {loading ? <div className="rounded-xl border border-slate-200 p-6 text-sm text-slate-500 dark:border-slate-800">Loading canonical analytics…</div> : null}
      {error ? <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">{error}</div> : null}

      {data && primary ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Net sales" value={money(primary.netSalesMinor, currency)} detail={`Gross ${money(primary.grossSalesMinor, currency)} · refunds ${money(primary.refundsMinor, currency)}`} />
            <MetricCard label="Average check" value={money(primary.averageCheckMinor, currency)} detail={`Tax ${money(primary.taxMinor, currency)}`} />
            <MetricCard label="Resource utilization" value={number(data.resources.utilizationPct, '%')} detail={`F&B attach ${number(data.resources.fbAttachRatePct, '%')}`} />
            <MetricCard label="Gross margin" value={money(data.inventory.grossMarginMinor, currency)} detail={`${number(data.inventory.grossMarginPct, '%')} · COGS ${money(data.inventory.cogsMinor, currency)}`} />
            <MetricCard label="Covers" value={number(data.restaurant.covers)} detail={`Avg/cover ${money(data.restaurant.averageSpendPerCoverMinor, currency)}`} />
            <MetricCard label="Reservation conversion" value={number(data.reservations.conversionToSessionPct, '%')} detail={`${data.reservations.bookingVolume} bookings · no-show ${number(data.reservations.noShowRatePct, '%')}`} />
            <MetricCard label="Returning customers" value={number(data.customers.returningCustomers)} detail={`Observed retention ${number(data.customers.retentionPct, '%')}`} />
            <MetricCard label="Labor-to-sales" value={number(data.workforce.laborToSalesPct, '%')} detail={`${number(data.workforce.laborHours, ' h')} recorded`} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950" aria-labelledby="reconciliation-title">
              <div className="flex items-start justify-between gap-3">
                <div><h2 id="reconciliation-title" className="text-lg font-semibold">Reconciliation Center</h2><p className="text-sm text-slate-500">GuestCheck → Settlement → Payment → Ledger → cash/provider/compliance.</p></div>
                <span className="text-sm font-semibold">{data.reconciliation.clear ? 'CLEAR' : `${data.reconciliation.issueCount} OPEN`}</span>
              </div>
              <div className="mt-4 space-y-3">
                {data.reconciliation.issues.length === 0 ? <p className="text-sm text-slate-500">No unresolved discrepancy was found in this scope.</p> : data.reconciliation.issues.slice(0, 20).map((issue) => (
                  <article key={issue.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-2"><Severity value={issue.severity} /><strong className="text-sm">{issue.type}</strong>{issue.amountMinor != null ? <span className="text-sm">{money(issue.amountMinor, issue.currency ?? currency)}</span> : null}</div>
                    <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{issue.message}</p>
                    <p className="mt-1 text-xs text-slate-500">Next: {issue.suggestedNextAction}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950" aria-labelledby="attention-title">
              <div className="flex items-start justify-between gap-3"><div><h2 id="attention-title" className="text-lg font-semibold">Attention Center</h2><p className="text-sm text-slate-500">Cross-domain exceptions that need an operator decision.</p></div><span className="text-sm font-semibold">{data.attention.itemCount}</span></div>
              <div className="mt-4 space-y-3">
                {data.attention.items.length === 0 ? <p className="text-sm text-slate-500">Nothing requires attention in the selected window.</p> : data.attention.items.slice(0, 20).map((item) => (
                  <article key={item.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-2"><Severity value={item.severity} /><span className="text-xs font-medium text-slate-500">{item.domain}</span><strong className="text-sm">{item.title}</strong></div>
                    <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{item.detail}</p>
                    <p className="mt-1 text-xs text-slate-500">Next: {item.suggestedNextAction}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Cash variance" value={money(primary.cash.varianceMinor, currency)} detail={`Expected ${money(primary.cash.expectedMinor, currency)} · counted ${money(primary.cash.countedMinor, currency)}`} />
            <MetricCard label="KDS SLA" value={number(data.restaurant.kds.slaPct, '%')} detail={`${data.restaurant.kds.lateTicketCount} late tickets`} />
            <MetricCard label="Inventory days on hand" value={number(data.inventory.daysOnHand, ' d')} detail={`${data.inventory.lowStockRisk.length} low-stock risks`} />
            <MetricCard label="Observed customer LTV" value={money(data.customers.observedLtvMinor, currency)} detail={`Member revenue ${money(data.customers.memberRevenueMinor, currency)}`} />
          </div>

          <p className="text-xs text-slate-500">Business-day scope: {data.context.timezone}, boundary +{data.context.businessDayStartMinutes} minutes after local midnight. Source: {data.sourceVersion}. Venue: {venuePath}.</p>
        </>
      ) : null}
    </section>
  );
}
