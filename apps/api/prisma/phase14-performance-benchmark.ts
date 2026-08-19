import { performance } from 'node:perf_hooks';

const FINANCE_FACTS = 250_000;
const RESOURCE_FACTS = 120_000;
const BUDGET_MS = Number(process.env.PHASE14_BENCHMARK_BUDGET_MS ?? 5000);

function benchmark() {
  const started = performance.now();
  const finance = Array.from({ length: FINANCE_FACTS }, (_, index) => ({
    kind: index % 29 === 0 ? 'REFUND' : 'SALE',
    amountMinor: 500 + (index % 10_000),
    currency: index % 7 === 0 ? 'EUR' : 'PLN',
  }));
  const resource = Array.from({ length: RESOURCE_FACTS }, (_, index) => ({
    resourceId: `r-${index % 200}`,
    occupiedMinutes: 10 + (index % 180),
    revenueMinor: 1000 + (index % 50_000),
  }));

  const byCurrency = new Map<string, { sales: number; refunds: number }>();
  for (const row of finance) {
    const bucket = byCurrency.get(row.currency) ?? { sales: 0, refunds: 0 };
    if (row.kind === 'SALE') bucket.sales += row.amountMinor;
    else bucket.refunds += row.amountMinor;
    byCurrency.set(row.currency, bucket);
  }
  const byResource = new Map<string, { occupiedMinutes: number; revenueMinor: number; sessions: number }>();
  for (const row of resource) {
    const bucket = byResource.get(row.resourceId) ?? { occupiedMinutes: 0, revenueMinor: 0, sessions: 0 };
    bucket.occupiedMinutes += row.occupiedMinutes;
    bucket.revenueMinor += row.revenueMinor;
    bucket.sessions += 1;
    byResource.set(row.resourceId, bucket);
  }
  const ranked = [...byResource.entries()]
    .map(([resourceId, row]) => ({
      resourceId,
      revenuePerOccupiedHourMinor: row.occupiedMinutes > 0 ? row.revenueMinor / (row.occupiedMinutes / 60) : null,
      sessions: row.sessions,
    }))
    .sort((a, b) => (b.revenuePerOccupiedHourMinor ?? -1) - (a.revenuePerOccupiedHourMinor ?? -1));

  const elapsedMs = performance.now() - started;
  if (byCurrency.size !== 2 || ranked.length !== 200) throw new Error('Phase 14 benchmark produced invalid aggregation cardinality');
  if (elapsedMs > BUDGET_MS) {
    throw new Error(`Phase 14 analytics kernel exceeded ${BUDGET_MS}ms budget: ${elapsedMs.toFixed(1)}ms`);
  }
  console.log(JSON.stringify({
    ok: true,
    elapsedMs: Number(elapsedMs.toFixed(1)),
    budgetMs: BUDGET_MS,
    facts: FINANCE_FACTS + RESOURCE_FACTS,
    financeFacts: FINANCE_FACTS,
    resourceFacts: RESOURCE_FACTS,
    resources: ranked.length,
  }));
}

benchmark();
