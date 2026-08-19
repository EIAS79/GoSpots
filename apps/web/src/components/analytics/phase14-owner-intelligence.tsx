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
};

type Attention = {
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
  context: { currency: string; timezone: string; businessDayStartMinutes: number };
  financial: { currencies: Array<{
    currency: string;
    grossSalesMinor: number;
    netSalesMinor: number;
    taxMinor: number;
    refundsMinor: number;
    averageCheckMinor: number | null;
    cash: { expectedMinor: number; countedMinor: number; varianceMinor: number };
  }> };
  resources: { utilizationPct: number | null; fbAttachRatePct: number | null };
  restaurant: { covers: number; averageSpendPerCoverMinor: number | null; kds: { slaPct: number | null; lateTicketCount: number } };
  inventory: { cogsMinor: number; grossMarginMinor: number; grossMarginPct: number | null; daysOnHand: number | null; lowStockRisk: unknown[] };
  reservations: { bookingVolume: number; conversionToSessionPct: number | null; noShowRatePct: number | null };
  customers: { returningCustomers: number; retentionPct: number | null; memberRevenueMinor: number; observedLtvMinor: number | null };
  workforce: { laborHours: number | null; laborToSalesPct: number | null };
  reconciliation: { clear: boolean; issueCount: number; issues: Issue[] };
  attention: { itemCount: number; items: Attention[] };
};

function key(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function money(value: number | null | undefined, currency: string) {
  if (value == null) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value / 100);
  } catch {
    return `${(value / 100).toFixed(2)} ${currency}`;
  }
}

function numeric(value: number | null | undefined, suffix = '') {
  return value == null ? '—' : `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)}${suffix}`;
}

function Card({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {detail ? <div className="mt-1 text-xs text-slate-500">{detail}</div> : null}
    </div>
  );
}

function EvidenceLink({ href }: { href: string | undefined }) {
  if (!href) return null;
  return <a href={href} className="mt-2 inline-block text-xs font-medium underline underline-offset-2">Open evidence</a>;
}

export function Phase14OwnerIntelligence({ venuePath }: { venuePath: string }) {
  const today = useMemo(() => new Date(), []);
  const first = useMemo(() => {
    const value = new Date(today);
    value.setDate(value.getDate() - 29);
    return key(value);
  }, [today]);
  const [fromDate, setFromDate] = useState(first);
  const [toDate, setToDate] = useState(key(today));
  const [data, setData] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ fromDate, toDate });
      const response = await apiFetch(`/growth/analytics/phase14/workspace?${params.toString()}`);
      if (!response.ok) throw new Error((await response.text()) || `Request failed: ${response.status}`);
      setData((await response.json()) as Workspace);
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
    <section className="space-y-5" aria-labelledby="phase14-title">
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Canonical owner intelligence</p>
          <h1 id="phase14-title" className="mt-1 text-2xl font-semibold">Analytics & reconciliation</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">One business-day scope across money, resources, restaurant, inventory, reservations, customers and workforce.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-500">From<input aria-label="Analytics from business date" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="mt-1 block rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700" /></label>
          <label className="text-xs text-slate-500">To<input aria-label="Analytics to business date" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="mt-1 block rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700" /></label>
          <button type="button" disabled={loading} onClick={() => void load()} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50 dark:border-slate-700">Refresh</button>
        </div>
      </div>

      {loading ? <div className="rounded-xl border border-slate-200 p-5 text-sm text-slate-500 dark:border-slate-800">Loading canonical analytics…</div> : null}
      {error ? <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">{error}</div> : null}

      {data && primary ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card label="Net sales" value={money(primary.netSalesMinor, currency)} detail={`Gross ${money(primary.grossSalesMinor, currency)} · refunds ${money(primary.refundsMinor, currency)}`} />
            <Card label="Average check" value={money(primary.averageCheckMinor, currency)} detail={`Tax ${money(primary.taxMinor, currency)}`} />
            <Card label="Resource utilization" value={numeric(data.resources.utilizationPct, '%')} detail={`F&B attach ${numeric(data.resources.fbAttachRatePct, '%')}`} />
            <Card label="Gross margin" value={money(data.inventory.grossMarginMinor, currency)} detail={`${numeric(data.inventory.grossMarginPct, '%')} · COGS ${money(data.inventory.cogsMinor, currency)}`} />
            <Card label="Covers" value={numeric(data.restaurant.covers)} detail={`Avg/cover ${money(data.restaurant.averageSpendPerCoverMinor, currency)}`} />
            <Card label="Reservation conversion" value={numeric(data.reservations.conversionToSessionPct, '%')} detail={`${data.reservations.bookingVolume} bookings · no-show ${numeric(data.reservations.noShowRatePct, '%')}`} />
            <Card label="Returning customers" value={numeric(data.customers.returningCustomers)} detail={`Observed retention ${numeric(data.customers.retentionPct, '%')}`} />
            <Card label="Labor-to-sales" value={numeric(data.workforce.laborToSalesPct, '%')} detail={`${numeric(data.workforce.laborHours, ' h')} recorded`} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Reconciliation Center</h2><p className="text-sm text-slate-500">GuestCheck → Settlement → Payment → Ledger → cash/provider/compliance.</p></div><strong className="text-sm">{data.reconciliation.clear ? 'CLEAR' : `${data.reconciliation.issueCount} OPEN`}</strong></div>
              <div className="mt-4 space-y-3">
                {data.reconciliation.issues.length === 0 ? <p className="text-sm text-slate-500">No unresolved discrepancy in this scope.</p> : data.reconciliation.issues.slice(0, 20).map((issue) => (
                  <article key={issue.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border px-2 py-0.5 text-[11px] font-semibold">{issue.severity}</span><strong className="text-sm">{issue.type}</strong>{issue.amountMinor != null ? <span className="text-sm">{money(issue.amountMinor, issue.currency ?? currency)}</span> : null}</div><p className="mt-2 text-sm">{issue.message}</p><p className="mt-1 text-xs text-slate-500">Next: {issue.suggestedNextAction}</p><EvidenceLink href={issue.evidenceLinks[0]} /></article>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Attention Center</h2><p className="text-sm text-slate-500">Cross-domain exceptions that need an operator decision.</p></div><strong className="text-sm">{data.attention.itemCount}</strong></div>
              <div className="mt-4 space-y-3">
                {data.attention.items.length === 0 ? <p className="text-sm text-slate-500">Nothing requires attention.</p> : data.attention.items.slice(0, 20).map((item) => (
                  <article key={item.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border px-2 py-0.5 text-[11px] font-semibold">{item.severity}</span><span className="text-xs text-slate-500">{item.domain}</span><strong className="text-sm">{item.title}</strong></div><p className="mt-2 text-sm">{item.detail}</p><p className="mt-1 text-xs text-slate-500">Next: {item.suggestedNextAction}</p><EvidenceLink href={item.evidenceLinks[0]} /></article>
                ))}
              </div>
            </section>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card label="Cash variance" value={money(primary.cash.varianceMinor, currency)} detail={`Expected ${money(primary.cash.expectedMinor, currency)} · counted ${money(primary.cash.countedMinor, currency)}`} />
            <Card label="KDS SLA" value={numeric(data.restaurant.kds.slaPct, '%')} detail={`${data.restaurant.kds.lateTicketCount} late tickets`} />
            <Card label="Inventory days on hand" value={numeric(data.inventory.daysOnHand, ' d')} detail={`${data.inventory.lowStockRisk.length} low-stock risks`} />
            <Card label="Observed customer LTV" value={money(data.customers.observedLtvMinor, currency)} detail={`Member revenue ${money(data.customers.memberRevenueMinor, currency)}`} />
          </div>

          <p className="text-xs text-slate-500">{data.context.timezone} · business day +{data.context.businessDayStartMinutes} minutes · {data.sourceVersion} · venue {venuePath}</p>
        </>
      ) : null}
    </section>
  );
}
