'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

type JsonRecord = Record<string, unknown>;
type Customer = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  marketingConsentAt?: string | null;
  consentSource?: string | null;
};
type PackageRow = {
  id: string;
  name: string;
  priceMinor: number;
  currency: string;
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

function correlation(prefix: string) {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`;
}

export function CustomerCommerceWorkspace() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [history, setHistory] = useState<JsonRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [consentSource, setConsentSource] = useState('STAFF');
  const [tierName, setTierName] = useState('');
  const [tierCode, setTierCode] = useState('');
  const [tierRank, setTierRank] = useState(0);
  const [tierEarnBps, setTierEarnBps] = useState(0);
  const [tierId, setTierId] = useState('');

  const [loyaltyType, setLoyaltyType] = useState('EARN');
  const [loyaltyPoints, setLoyaltyPoints] = useState(100);
  const [loyaltySourceType, setLoyaltySourceType] = useState('GUEST_CHECK');
  const [loyaltySourceId, setLoyaltySourceId] = useState('');

  const [reverseSourceType, setReverseSourceType] = useState('PAYMENT');
  const [reverseSourceId, setReverseSourceId] = useState('');

  const [visitSourceType, setVisitSourceType] = useState('GUEST_CHECK');
  const [visitSourceId, setVisitSourceId] = useState('');
  const [visitId, setVisitId] = useState('');
  const [reviewProof, setReviewProof] = useState<JsonRecord | null>(null);

  const [walletId, setWalletId] = useState('');
  const [walletCode, setWalletCode] = useState('');
  const [walletType, setWalletType] = useState('LOAD');
  const [walletAmount, setWalletAmount] = useState(1000);
  const [walletPaymentId, setWalletPaymentId] = useState('');
  const [walletSourceType, setWalletSourceType] = useState('GUEST_CHECK');
  const [walletSourceId, setWalletSourceId] = useState('');

  const [packageName, setPackageName] = useState('');
  const [packagePrice, setPackagePrice] = useState(5000);
  const [packageCost, setPackageCost] = useState(1000);
  const [packageCurrency, setPackageCurrency] = useState('EUR');

  const [tipType, setTipType] = useState('TIP');
  const [tipAmount, setTipAmount] = useState(500);
  const [tipGuestCheckId, setTipGuestCheckId] = useState('');
  const [tipPaymentId, setTipPaymentId] = useState('');
  const [tipReport, setTipReport] = useState<JsonRecord | null>(null);

  const selected = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
  );

  const run = useCallback(async <T,>(work: () => Promise<T>, success?: string) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await work();
      if (success) setMessage(success);
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Request failed.');
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const loadCustomers = useCallback(async () => {
    const rows = await run(() => request<Customer[]>('/growth/customers'));
    if (!rows) return;
    setCustomers(rows);
    setSelectedCustomerId((current) => current || rows[0]?.id || '');
  }, [run]);

  const loadPackages = useCallback(async () => {
    const rows = await run(() => request<PackageRow[]>('/growth/packages'));
    if (rows) setPackages(rows);
  }, [run]);

  const loadHistory = useCallback(
    async (customerId = selectedCustomerId) => {
      if (!customerId) return;
      const row = await run(() =>
        request<JsonRecord>(`/growth/customers/${customerId}/history`),
      );
      if (row) setHistory(row);
    },
    [run, selectedCustomerId],
  );

  useEffect(() => {
    void loadCustomers();
    void loadPackages();
  }, [loadCustomers, loadPackages]);

  useEffect(() => {
    if (selectedCustomerId) void loadHistory(selectedCustomerId);
  }, [loadHistory, selectedCustomerId]);

  async function setConsent(granted: boolean) {
    if (!selectedCustomerId) return;
    const row = await run(
      () =>
        request<Customer>(
          `/growth/customers/${selectedCustomerId}/marketing-consent`,
          {
            method: 'POST',
            body: JSON.stringify({ granted, source: consentSource || 'STAFF' }),
          },
        ),
      granted ? 'Marketing consent granted.' : 'Marketing consent revoked.',
    );
    if (row) {
      await loadCustomers();
      await loadHistory(selectedCustomerId);
    }
  }

  async function createTier() {
    const row = await run(
      () =>
        request<{ id: string }>('/growth/membership-tiers', {
          method: 'POST',
          body: JSON.stringify({
            name: tierName,
            code: tierCode,
            rank: tierRank,
            earnRateBasisPoints: tierEarnBps,
          }),
        }),
      'Membership tier created.',
    );
    if (row) setTierId(row.id);
  }

  async function enroll() {
    if (!selectedCustomerId || !tierId) return;
    const row = await run(
      () =>
        request(`/growth/customers/${selectedCustomerId}/membership`, {
          method: 'POST',
          body: JSON.stringify({ tierId }),
        }),
      'Customer membership updated.',
    );
    if (row) await loadHistory();
  }

  async function addLoyalty() {
    if (!selectedCustomerId) return;
    const row = await run(
      () =>
        request(`/growth/customers/${selectedCustomerId}/loyalty`, {
          method: 'POST',
          body: JSON.stringify({
            type: loyaltyType,
            points: loyaltyPoints,
            sourceType: loyaltySourceType || undefined,
            sourceId: loyaltySourceId || undefined,
            correlationId: correlation('loyalty'),
          }),
        }),
      'Loyalty ledger movement recorded.',
    );
    if (row) await loadHistory();
  }

  async function reverseRewards() {
    if (!selectedCustomerId || !reverseSourceType || !reverseSourceId) return;
    const row = await run(
      () =>
        request(`/growth/customers/${selectedCustomerId}/rewards/reverse`, {
          method: 'POST',
          body: JSON.stringify({
            sourceType: reverseSourceType,
            sourceId: reverseSourceId,
            correlationId: correlation('reward-reversal'),
          }),
        }),
      'Eligible reward for the source was reversed.',
    );
    if (row) await loadHistory();
  }

  async function recordVisit() {
    if (!selectedCustomerId || !visitSourceId) return;
    const row = await run(
      () =>
        request<{ id: string }>(`/growth/customers/${selectedCustomerId}/visits`, {
          method: 'POST',
          body: JSON.stringify({ sourceType: visitSourceType, sourceId: visitSourceId }),
        }),
      'Verified visit recorded from canonical evidence.',
    );
    if (row) {
      setVisitId(row.id);
      setReviewProof(null);
      await loadHistory();
    }
  }

  async function issueProof() {
    if (!selectedCustomerId || !visitId) return;
    const row = await run(
      () =>
        request<JsonRecord>(
          `/growth/customers/${selectedCustomerId}/visits/${visitId}/review-proof`,
          { method: 'POST' },
        ),
      'One-time verified-review proof issued.',
    );
    if (row) setReviewProof(row);
  }

  async function createWallet() {
    const row = await run(
      () =>
        request<{ account: { id: string }; code: string }>('/growth/stored-value/accounts', {
          method: 'POST',
          body: JSON.stringify({
            customerId: selectedCustomerId || undefined,
            currency: packageCurrency,
          }),
        }),
      'Stored-value account created. Copy the plaintext code now; it is not stored.',
    );
    if (row) {
      setWalletId(row.account.id);
      setWalletCode(row.code);
      await loadHistory();
    }
  }

  async function moveWallet() {
    if (!walletId) return;
    const row = await run(
      () =>
        request(`/growth/stored-value/accounts/${walletId}/ledger`, {
          method: 'POST',
          body: JSON.stringify({
            type: walletType,
            amountMinor: walletAmount,
            sourceType: walletSourceType || undefined,
            sourceId: walletSourceId || undefined,
            paymentId: walletPaymentId || undefined,
            correlationId: correlation('stored-value'),
          }),
        }),
      'Stored-value ledger movement recorded.',
    );
    if (row) await loadHistory();
  }

  async function createPackage() {
    const row = await run(
      () =>
        request('/growth/packages', {
          method: 'POST',
          body: JSON.stringify({
            name: packageName,
            priceMinor: packagePrice,
            currency: packageCurrency,
            components: [{ kind: 'MANUAL', quantity: 1, costMinor: packageCost }],
          }),
        }),
      'Package created with a direct-cost component for reconciliation.',
    );
    if (row) {
      setPackageName('');
      await loadPackages();
    }
  }

  async function recordTip() {
    if (!tipGuestCheckId) return;
    const row = await run(
      () =>
        request('/growth/tips', {
          method: 'POST',
          body: JSON.stringify({
            guestCheckId: tipGuestCheckId,
            paymentId: tipPaymentId || undefined,
            type: tipType,
            amountMinor: tipAmount,
            currency: packageCurrency,
            correlationId: correlation('tip'),
          }),
        }),
      'Tip/reversal movement recorded in the append-only ledger.',
    );
    if (row) await loadTipReport();
  }

  async function loadTipReport() {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    const row = await run(() =>
      request<JsonRecord>(
        `/growth/tips/report?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
      ),
    );
    if (row) setTipReport(row);
  }

  return (
    <div className="space-y-6">
      <header className="rounded-lg border bg-card p-5">
        <h1 className="text-xl font-semibold">Customer, loyalty & commerce controls</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Operator workflows for consent, memberships, rewards, verified visits, stored value, packages and tips.
        </p>
      </header>

      {message ? <div className="rounded-md border bg-card p-3 text-sm">{message}</div> : null}
      {error ? <div className="rounded-md border border-destructive p-3 text-sm text-destructive">{error}</div> : null}

      <section className="rounded-lg border bg-card p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <Field label="Customer">
            <select
              className="w-full rounded-md border bg-background p-2"
              value={selectedCustomerId}
              onChange={(event) => setSelectedCustomerId(event.target.value)}
            >
              <option value="">Select customer</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name || customer.email || customer.phone || customer.id}
                </option>
              ))}
            </select>
          </Field>
          <button className="rounded-md border px-4 py-2 text-sm" disabled={busy} onClick={() => void loadCustomers()}>
            Refresh
          </button>
        </div>
        {selected ? (
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <Stat label="Email" value={selected.email || '—'} />
            <Stat label="Phone" value={selected.phone || '—'} />
            <Stat
              label="Marketing consent"
              value={selected.marketingConsentAt ? `${selected.consentSource || 'Granted'} · ${new Date(selected.marketingConsentAt).toLocaleString()}` : 'Not granted'}
            />
          </div>
        ) : null}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Consent & membership">
          <Field label="Consent source">
            <input className="w-full rounded-md border bg-background p-2" value={consentSource} onChange={(event) => setConsentSource(event.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button busy={busy} disabled={!selectedCustomerId} onClick={() => void setConsent(true)}>Grant consent</Button>
            <Button busy={busy} disabled={!selectedCustomerId} onClick={() => void setConsent(false)}>Revoke consent</Button>
          </div>
          <div className="border-t pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tier name"><input className="w-full rounded-md border bg-background p-2" value={tierName} onChange={(event) => setTierName(event.target.value)} /></Field>
              <Field label="Tier code"><input className="w-full rounded-md border bg-background p-2" value={tierCode} onChange={(event) => setTierCode(event.target.value.toUpperCase())} /></Field>
              <Field label="Rank"><input className="w-full rounded-md border bg-background p-2" type="number" value={tierRank} onChange={(event) => setTierRank(Number(event.target.value))} /></Field>
              <Field label="Earn bps"><input className="w-full rounded-md border bg-background p-2" type="number" min={0} value={tierEarnBps} onChange={(event) => setTierEarnBps(Number(event.target.value))} /></Field>
            </div>
            <div className="mt-3 flex flex-wrap gap-2"><Button busy={busy} disabled={!tierName || !tierCode} onClick={() => void createTier()}>Create tier</Button></div>
          </div>
          <Field label="Tier ID to enroll">
            <input className="w-full rounded-md border bg-background p-2 font-mono text-xs" value={tierId} onChange={(event) => setTierId(event.target.value)} />
          </Field>
          <Button busy={busy} disabled={!selectedCustomerId || !tierId} onClick={() => void enroll()}>Enroll / update membership</Button>
        </Panel>

        <Panel title="Loyalty & refund reversal">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Movement">
              <select className="w-full rounded-md border bg-background p-2" value={loyaltyType} onChange={(event) => setLoyaltyType(event.target.value)}>
                {['EARN', 'REDEEM', 'EXPIRE', 'ADJUST', 'REVERSAL'].map((value) => <option key={value}>{value}</option>)}
              </select>
            </Field>
            <Field label="Points"><input className="w-full rounded-md border bg-background p-2" type="number" value={loyaltyPoints} onChange={(event) => setLoyaltyPoints(Number(event.target.value))} /></Field>
            <Field label="Source type"><input className="w-full rounded-md border bg-background p-2" value={loyaltySourceType} onChange={(event) => setLoyaltySourceType(event.target.value)} /></Field>
            <Field label="Source ID"><input className="w-full rounded-md border bg-background p-2" value={loyaltySourceId} onChange={(event) => setLoyaltySourceId(event.target.value)} /></Field>
          </div>
          <Button busy={busy} disabled={!selectedCustomerId} onClick={() => void addLoyalty()}>Record loyalty movement</Button>
          <div className="border-t pt-4">
            <p className="mb-3 text-sm text-muted-foreground">Reverse only the positive net reward linked to a refunded/canceled canonical source.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Source type"><input className="w-full rounded-md border bg-background p-2" value={reverseSourceType} onChange={(event) => setReverseSourceType(event.target.value)} /></Field>
              <Field label="Source ID"><input className="w-full rounded-md border bg-background p-2" value={reverseSourceId} onChange={(event) => setReverseSourceId(event.target.value)} /></Field>
            </div>
            <Button busy={busy} disabled={!selectedCustomerId || !reverseSourceId} onClick={() => void reverseRewards()}>Reverse source rewards</Button>
          </div>
        </Panel>

        <Panel title="Verified visit & review proof">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Canonical source">
              <select className="w-full rounded-md border bg-background p-2" value={visitSourceType} onChange={(event) => setVisitSourceType(event.target.value)}>
                {['RESERVATION', 'GUEST_CHECK', 'OPERATIONS_SESSION', 'EVENT'].map((value) => <option key={value}>{value}</option>)}
              </select>
            </Field>
            <Field label="Source ID"><input className="w-full rounded-md border bg-background p-2" value={visitSourceId} onChange={(event) => setVisitSourceId(event.target.value)} /></Field>
          </div>
          <Button busy={busy} disabled={!selectedCustomerId || !visitSourceId} onClick={() => void recordVisit()}>Verify visit</Button>
          <Field label="Visit ID"><input className="w-full rounded-md border bg-background p-2 font-mono text-xs" value={visitId} onChange={(event) => setVisitId(event.target.value)} /></Field>
          <Button busy={busy} disabled={!selectedCustomerId || !visitId} onClick={() => void issueProof()}>Issue review proof</Button>
          {reviewProof ? <JsonBlock value={reviewProof} /> : null}
        </Panel>

        <Panel title="Stored value">
          <Button busy={busy} disabled={!selectedCustomerId} onClick={() => void createWallet()}>Create customer wallet</Button>
          {walletCode ? (
            <div className="rounded-md border p-3 text-sm">
              <div className="font-medium">Plaintext code — copy now</div>
              <div className="mt-1 break-all font-mono">{walletCode}</div>
            </div>
          ) : null}
          <Field label="Account ID"><input className="w-full rounded-md border bg-background p-2 font-mono text-xs" value={walletId} onChange={(event) => setWalletId(event.target.value)} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Movement">
              <select className="w-full rounded-md border bg-background p-2" value={walletType} onChange={(event) => setWalletType(event.target.value)}>
                {['LOAD', 'REDEEM', 'REFUND', 'ADJUST', 'REVERSAL'].map((value) => <option key={value}>{value}</option>)}
              </select>
            </Field>
            <Field label="Amount minor"><input className="w-full rounded-md border bg-background p-2" type="number" min={1} value={walletAmount} onChange={(event) => setWalletAmount(Number(event.target.value))} /></Field>
            <Field label="Source type"><input className="w-full rounded-md border bg-background p-2" value={walletSourceType} onChange={(event) => setWalletSourceType(event.target.value)} /></Field>
            <Field label="Source ID"><input className="w-full rounded-md border bg-background p-2" value={walletSourceId} onChange={(event) => setWalletSourceId(event.target.value)} /></Field>
          </div>
          <Field label="Successful payment ID (loads only, optional otherwise)"><input className="w-full rounded-md border bg-background p-2" value={walletPaymentId} onChange={(event) => setWalletPaymentId(event.target.value)} /></Field>
          <Button busy={busy} disabled={!walletId} onClick={() => void moveWallet()}>Record wallet movement</Button>
        </Panel>

        <Panel title="Packages & profitability inputs">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Package name"><input className="w-full rounded-md border bg-background p-2" value={packageName} onChange={(event) => setPackageName(event.target.value)} /></Field>
            <Field label="Currency"><input className="w-full rounded-md border bg-background p-2" value={packageCurrency} onChange={(event) => setPackageCurrency(event.target.value.toUpperCase())} /></Field>
            <Field label="Price minor"><input className="w-full rounded-md border bg-background p-2" type="number" min={0} value={packagePrice} onChange={(event) => setPackagePrice(Number(event.target.value))} /></Field>
            <Field label="Direct cost minor"><input className="w-full rounded-md border bg-background p-2" type="number" min={0} value={packageCost} onChange={(event) => setPackageCost(Number(event.target.value))} /></Field>
          </div>
          <Button busy={busy} disabled={!packageName} onClick={() => void createPackage()}>Create package</Button>
          <div className="space-y-2 border-t pt-4">
            {packages.length ? packages.map((row) => (
              <div key={row.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <span>{row.name}</span><span>{row.priceMinor} {row.currency}</span>
              </div>
            )) : <p className="text-sm text-muted-foreground">No packages.</p>}
          </div>
        </Panel>

        <Panel title="Tips, refunds & reversals">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Movement">
              <select className="w-full rounded-md border bg-background p-2" value={tipType} onChange={(event) => setTipType(event.target.value)}>
                {['TIP', 'REFUND', 'REVERSAL'].map((value) => <option key={value}>{value}</option>)}
              </select>
            </Field>
            <Field label="Amount minor"><input className="w-full rounded-md border bg-background p-2" type="number" value={tipAmount} onChange={(event) => setTipAmount(Number(event.target.value))} /></Field>
            <Field label="GuestCheck ID"><input className="w-full rounded-md border bg-background p-2" value={tipGuestCheckId} onChange={(event) => setTipGuestCheckId(event.target.value)} /></Field>
            <Field label="Successful payment ID (optional)"><input className="w-full rounded-md border bg-background p-2" value={tipPaymentId} onChange={(event) => setTipPaymentId(event.target.value)} /></Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button busy={busy} disabled={!tipGuestCheckId} onClick={() => void recordTip()}>Record tip movement</Button>
            <Button busy={busy} onClick={() => void loadTipReport()}>Last 30 days report</Button>
          </div>
          {tipReport ? <JsonBlock value={tipReport} /> : null}
        </Panel>
      </div>

      <Panel title="Selected customer history / reconciliation evidence">
        <div className="mb-3"><Button busy={busy} disabled={!selectedCustomerId} onClick={() => void loadHistory()}>Refresh history</Button></div>
        {history ? <JsonBlock value={history} /> : <p className="text-sm text-muted-foreground">Select a customer.</p>}
      </Panel>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-4 rounded-lg border bg-card p-5"><h2 className="font-semibold">{title}</h2>{children}</section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1 text-sm"><span className="text-muted-foreground">{label}</span>{children}</label>;
}

function Button({ busy, disabled, onClick, children }: { busy: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" className="rounded-md border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50" disabled={busy || disabled} onClick={onClick}>{children}</button>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 break-words font-medium">{value}</div></div>;
}

function JsonBlock({ value }: { value: unknown }) {
  return <pre className="max-h-80 overflow-auto rounded-md border bg-muted/30 p-3 text-xs">{JSON.stringify(value, null, 2)}</pre>;
}
