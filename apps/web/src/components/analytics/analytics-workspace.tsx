'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

type View = 'overview' | 'operations' | 'guests' | 'finance';
type JsonRecord = Record<string, unknown>;

type FinanceCurrency = {
  currency: string;
  netSettledRevenueMinor: number;
  providerNetMinor: number;
  reconciliationVarianceMinor: number;
  reconciliationOk: boolean;
  discountMinor: number;
  tipMinor: number;
  cogsMinor: number;
  laborCostMinor: number;
  contributionMinor: number;
  contributionMarginPct: number | null;
};

type FinanceData = {
  sourceOfTruth: string;
  sourceVersion: string;
  currencies: FinanceCurrency[];
  reconciliation: { ok: boolean; byCurrency: Record<string, number> };
  ledgerEntryCount: number;
  providerPaymentCount: number;
  providerRefundCount: number;
  workedSeconds: number;
};

type OperationsData = {
  sourceVersion: string;
  resources: {
    resourceCount: number;
    availableMinutes: number;
    occupiedMinutes: number;
    utilizationPct: number | null;
    accruedResourceRevenueMinor: number;
    revPahAccruedMinor: number | null;
    rows: Array<{
      resourceId: string;
      resourceName: string;
      resourceType: string | null;
      availableMinutes: number;
      occupiedMinutes: number;
      utilizationPct: number | null;
      accruedResourceRevenueMinor: number;
    }>;
  };
  menuAttachment: {
    activityGuestCheckCount: number;
    players: number;
    menuQuantity: number;
    quantityPerPlayer: number | null;
  };
  reservations: {
    count: number;
    byStatus: Record<string, number>;
    noShowRatePct: number | null;
    waitlistClaimRatePct: number | null;
  };
  kds: {
    completedTicketCount: number;
    averagePrepSeconds: number | null;
    slaMetCount: number;
    slaPct: number | null;
  };
};

type GuestsData = {
  sourceVersion: string;
  visits: { completedVisitCount: number; identifiedCustomerCount: number };
  repeatVisits: {
    repeatCustomerCount: number;
    eligibleCustomerCount: number;
    ratePct: number | null;
  };
  loyalty: { outstandingPoints: number };
  storedValue: { liabilityByCurrency: Record<string, number> };
  acquisition: {
    channels: Array<{
      channel: string;
      touches: number;
      settledVisits: number;
      revenueMinor: number;
      ratePct: number | null;
    }>;
    overall: {
      touches: number;
      settledVisits: number;
      revenueMinor: number;
      ratePct: number | null;
    };
  };
  promotions: {
    rows: Array<{
      promotionId: string;
      applications: number;
      discountMinor: number;
      attributedRevenueMinor: number;
      directPackageCostMinor: number;
      partialContributionMinor: number;
      costCoverage: string;
    }>;
  };
};

type OverviewData = {
  sourceVersion: string;
  cards: {
    netSettledRevenueByCurrency: Record<string, number>;
    resourceUtilizationPct: number | null;
    repeatVisitRatePct: number | null;
    acquisitionToSettledVisitPct: number | null;
    kdsSlaPct: number | null;
  };
  alerts: JsonRecord[];
  finance: FinanceData;
  operations: OperationsData;
  guests: GuestsData;
};

const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'operations', label: 'Operations' },
  { id: 'guests', label: 'Guests' },
  { id: 'finance', label: 'Finance' },
];

function dateInput(date: Date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 10);
}

function money(value: number | null | undefined) {
  return value == null ? '—' : (value / 100).toFixed(2);
}

function pct(value: number | null | undefined) {
  return value == null ? '—' : `${value.toFixed(1)}%`;
}

async function loadJson<T>(path: string): Promise<T> {
  const response = await apiFetch(path);
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;
    throw new Error(payload?.message || `Analytics request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export function AnalyticsWorkspace({ venuePath }: { venuePath: string }) {
  const [view, setView] = useState<View>('overview');
  const [from, setFrom] = useState(
    dateInput(new Date(Date.now() - 30 * 24 * 60 * 60_000)),
  );
  const [to, setTo] = useState(dateInput(new Date()));
  const [data, setData] = useState<OverviewData | OperationsData | GuestsData | FinanceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const range = useMemo(() => {
    const start = new Date(`${from}T00:00:00`);
    const endDay = new Date(`${to}T00:00:00`);
    const end = new Date(endDay.getTime() + 24 * 60 * 60_000);
    return { from: start.toISOString(), to: end.toISOString() };
  }, [from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams(range);
      const next = await loadJson<OverviewData | OperationsData | GuestsData | FinanceData>(
        `/growth/analytics/${view}?${params}`,
      );
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analytics request failed.');
    } finally {
      setLoading(false);
    }
  }, [range, view]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">Venue: {venuePath}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics 2.0</h1>
        <p className="text-sm text-muted-foreground">
          Financial metrics reconcile to the Ledger; operational and guest metrics use canonical venue evidence.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
        <label className="space-y-1 text-sm">
          <span className="font-medium">From</span>
          <input className="block rounded-md border bg-background p-2" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">To</span>
          <input className="block rounded-md border bg-background p-2" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <button type="button" className="rounded-md border px-3 py-2 text-sm font-medium" onClick={() => void load()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Analytics views">
        {VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setView(item.id)}
            className={`rounded-md border px-3 py-2 text-sm font-medium ${
              view === item.id ? 'bg-foreground text-background' : 'bg-background'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {error ? <div role="alert" className="rounded-md border p-3 text-sm">{error}</div> : null}
      {!data || loading ? <div className="rounded-lg border p-6 text-sm text-muted-foreground">Loading decision metrics…</div> : null}
      {data && !loading && view === 'overview' ? <OverviewView data={data as OverviewData} /> : null}
      {data && !loading && view === 'operations' ? <OperationsView data={data as OperationsData} /> : null}
      {data && !loading && view === 'guests' ? <GuestsView data={data as GuestsData} /> : null}
      {data && !loading && view === 'finance' ? <FinanceView data={data as FinanceData} /> : null}
    </main>
  );
}

function OverviewView({ data }: { data: OverviewData }) {
  return (
    <section className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Resource utilization" value={pct(data.cards.resourceUtilizationPct)} />
        <Metric label="Repeat visit rate" value={pct(data.cards.repeatVisitRatePct)} />
        <Metric label="Acquisition → visit" value={pct(data.cards.acquisitionToSettledVisitPct)} />
        <Metric label="KDS SLA" value={pct(data.cards.kdsSlaPct)} />
        <Metric label="Currencies" value={String(Object.keys(data.cards.netSettledRevenueByCurrency).length)} />
      </div>
      <div className="rounded-lg border p-4">
        <h2 className="font-semibold">Net settled revenue</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {Object.entries(data.cards.netSettledRevenueByCurrency).map(([currency, value]) => (
            <div key={currency} className="rounded-md border p-3 text-sm">
              <div className="text-muted-foreground">{currency}</div>
              <div className="text-lg font-semibold">{money(value)}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-lg border p-4">
        <h2 className="font-semibold">Decision alerts</h2>
        {data.alerts.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No reconciliation or utilization alerts in this range.</p>
        ) : (
          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(data.alerts, null, 2)}</pre>
        )}
      </div>
    </section>
  );
}

function OperationsView({ data }: { data: OperationsData }) {
  return (
    <section className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Utilization" value={pct(data.resources.utilizationPct)} />
        <Metric label="RevPAH (accrued)" value={money(data.resources.revPahAccruedMinor)} />
        <Metric label="Menu qty / player" value={data.menuAttachment.quantityPerPlayer?.toFixed(2) ?? '—'} />
        <Metric label="KDS SLA" value={pct(data.kds.slaPct)} />
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[760px] text-sm">
          <thead><tr className="border-b text-left"><Th>Resource</Th><Th>Type</Th><Th>Available min</Th><Th>Occupied min</Th><Th>Utilization</Th><Th>Accrued revenue</Th></tr></thead>
          <tbody>
            {data.resources.rows.map((row) => (
              <tr key={row.resourceId} className="border-b last:border-0">
                <Td>{row.resourceName}</Td><Td>{row.resourceType ?? '—'}</Td><Td>{Math.round(row.availableMinutes)}</Td><Td>{Math.round(row.occupiedMinutes)}</Td><Td>{pct(row.utilizationPct)}</Td><Td>{money(row.accruedResourceRevenueMinor)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <JsonCard title="Reservation outcomes" value={data.reservations} />
        <JsonCard title="Kitchen service" value={data.kds} />
      </div>
    </section>
  );
}

function GuestsView({ data }: { data: GuestsData }) {
  return (
    <section className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Completed visits" value={String(data.visits.completedVisitCount)} />
        <Metric label="Repeat visit rate" value={pct(data.repeatVisits.ratePct)} />
        <Metric label="Outstanding points" value={String(data.loyalty.outstandingPoints)} />
        <Metric label="Acquisition → visit" value={pct(data.acquisition.overall.ratePct)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border p-4">
          <h2 className="font-semibold">Acquisition → settled visit</h2>
          <div className="mt-3 space-y-2">
            {data.acquisition.channels.length === 0 ? <p className="text-sm text-muted-foreground">No attributable public acquisition in this range.</p> : data.acquisition.channels.map((row) => (
              <div key={row.channel} className="grid grid-cols-4 gap-2 rounded-md border p-3 text-sm">
                <div className="font-medium">{row.channel}</div><div>{row.touches} touches</div><div>{row.settledVisits} visits</div><div>{pct(row.ratePct)}</div>
              </div>
            ))}
          </div>
        </div>
        <JsonCard title="Stored-value liability" value={data.storedValue.liabilityByCurrency} />
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[760px] text-sm">
          <thead><tr className="border-b text-left"><Th>Promotion</Th><Th>Applications</Th><Th>Discount</Th><Th>Attributed revenue</Th><Th>Direct package cost</Th><Th>Partial contribution</Th></tr></thead>
          <tbody>
            {data.promotions.rows.map((row) => (
              <tr key={row.promotionId} className="border-b last:border-0">
                <Td><span className="font-mono text-xs">{row.promotionId}</span></Td><Td>{row.applications}</Td><Td>{money(row.discountMinor)}</Td><Td>{money(row.attributedRevenueMinor)}</Td><Td>{money(row.directPackageCostMinor)}</Td><Td>{money(row.partialContributionMinor)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FinanceView({ data }: { data: FinanceData }) {
  return (
    <section className="space-y-5">
      <div className="rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-semibold">Ledger reconciliation</h2><p className="text-sm text-muted-foreground">Financial source of truth: {data.sourceOfTruth}</p></div>
          <span className="rounded-md border px-3 py-1 text-sm font-medium">{data.reconciliation.ok ? 'Reconciled' : 'Variance detected'}</span>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[1000px] text-sm">
          <thead><tr className="border-b text-left"><Th>Currency</Th><Th>Ledger net</Th><Th>Provider net</Th><Th>Variance</Th><Th>Discounts</Th><Th>Tips</Th><Th>COGS</Th><Th>Labor</Th><Th>Contribution</Th><Th>Margin</Th></tr></thead>
          <tbody>
            {data.currencies.map((row) => (
              <tr key={row.currency} className="border-b last:border-0">
                <Td>{row.currency}</Td><Td>{money(row.netSettledRevenueMinor)}</Td><Td>{money(row.providerNetMinor)}</Td><Td>{money(row.reconciliationVarianceMinor)}</Td><Td>{money(row.discountMinor)}</Td><Td>{money(row.tipMinor)}</Td><Td>{money(row.cogsMinor)}</Td><Td>{money(row.laborCostMinor)}</Td><Td>{money(row.contributionMinor)}</Td><Td>{pct(row.contributionMarginPct)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Ledger entries" value={String(data.ledgerEntryCount)} />
        <Metric label="Provider payments" value={String(data.providerPaymentCount)} />
        <Metric label="Provider refunds" value={String(data.providerRefundCount)} />
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border p-4"><div className="text-sm text-muted-foreground">{label}</div><div className="mt-1 text-xl font-semibold">{value}</div></div>;
}

function JsonCard({ title, value }: { title: string; value: unknown }) {
  return <div className="rounded-lg border p-4"><h2 className="font-semibold">{title}</h2><pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(value, null, 2)}</pre></div>;
}

function Th({ children }: { children: React.ReactNode }) { return <th className="px-3 py-2 font-medium">{children}</th>; }
function Td({ children }: { children: React.ReactNode }) { return <td className="px-3 py-2 align-top">{children}</td>; }
