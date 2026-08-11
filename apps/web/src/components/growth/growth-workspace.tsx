'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

type Tab = 'reservations' | 'promotions' | 'customers' | 'events';
type JsonRecord = Record<string, unknown>;

type CapacityResource = {
  id: string;
  name: string;
  type: string | null;
  categoryId: string | null;
  capacity: number | null;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
};

type WaitlistEntry = {
  id: string;
  guestName: string;
  partySize: number;
  status: string;
  desiredStartsAt: string;
  desiredEndsAt: string;
  offerExpiresAt?: string | null;
};

type Promotion = {
  id: string;
  name: string;
  code?: string | null;
  kind: string;
  priority: number;
  active: boolean;
  conditions?: unknown[];
  benefits?: unknown[];
};

type Customer = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  marketingConsentAt?: string | null;
};

type EventDetail = {
  state: string;
  event: JsonRecord;
  proposals: JsonRecord[];
  holds: JsonRecord[];
  paymentSchedule: JsonRecord[];
  checklist: JsonRecord[];
  profitability?: JsonRecord;
};

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'reservations', label: 'Reservations' },
  { id: 'promotions', label: 'Promotions' },
  { id: 'customers', label: 'Customers' },
  { id: 'events', label: 'Events' },
];

function isoFromLocal(value: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function localValue(date = new Date(Date.now() + 60 * 60_000)) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function moneyMinor(value: unknown) {
  return typeof value === 'number' ? (value / 100).toFixed(2) : '—';
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;
    throw new Error(payload?.message || `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export function GrowthWorkspace({ venuePath }: { venuePath: string }) {
  const [tab, setTab] = useState<Tab>('reservations');
  const [notice, setNotice] = useState<string>('');
  const [error, setError] = useState<string>('');

  const run = useCallback(async <T,>(work: () => Promise<T>, message?: string) => {
    setError('');
    setNotice('');
    try {
      const result = await work();
      if (message) setNotice(message);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed.');
      return undefined;
    }
  }, []);

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">Venue: {venuePath}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Growth operations</h1>
        <p className="text-sm text-muted-foreground">
          Reservations 2.0, pricing, CRM and event execution share the same venue data and settlement evidence.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="Growth sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-md border px-3 py-2 text-sm font-medium ${
              tab === item.id ? 'bg-foreground text-background' : 'bg-background'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {error ? (
        <div role="alert" className="rounded-md border p-3 text-sm">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div role="status" className="rounded-md border p-3 text-sm">
          {notice}
        </div>
      ) : null}

      {tab === 'reservations' ? <ReservationsPanel run={run} /> : null}
      {tab === 'promotions' ? <PromotionsPanel run={run} /> : null}
      {tab === 'customers' ? <CustomersPanel run={run} /> : null}
      {tab === 'events' ? <EventsPanel run={run} /> : null}
    </main>
  );
}

type Runner = <T>(work: () => Promise<T>, message?: string) => Promise<T | undefined>;

function ReservationsPanel({ run }: { run: Runner }) {
  const [startsAt, setStartsAt] = useState(localValue());
  const [endsAt, setEndsAt] = useState(localValue(new Date(Date.now() + 2 * 60 * 60_000)));
  const [partySize, setPartySize] = useState(2);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [recurrence, setRecurrence] = useState(1);
  const [capacity, setCapacity] = useState<CapacityResource[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [timeline, setTimeline] = useState<JsonRecord | null>(null);

  const loadWaitlist = useCallback(async () => {
    const rows = await run(() => json<WaitlistEntry[]>('/growth/waitlist'));
    if (rows) setWaitlist(rows);
  }, [run]);

  useEffect(() => {
    void loadWaitlist();
  }, [loadWaitlist]);

  async function checkCapacity() {
    const params = new URLSearchParams({
      startsAt: isoFromLocal(startsAt),
      endsAt: isoFromLocal(endsAt),
      partySize: String(partySize),
    });
    const result = await run(() =>
      json<{ available: CapacityResource[] }>(`/growth/reservations/capacity?${params}`),
    );
    if (result) setCapacity(result.available);
  }

  async function createReservation() {
    const result = await run(
      () =>
        json<{ reservations: Array<{ reservationId: string }> }>('/growth/reservations/unified', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            startsAt: isoFromLocal(startsAt),
            endsAt: isoFromLocal(endsAt),
            partySize,
            guestName,
            guestEmail: guestEmail || undefined,
            sourceChannel: 'STAFF',
            recurrence:
              recurrence > 1
                ? { frequency: 'WEEKLY', count: recurrence }
                : undefined,
          }),
        }),
      recurrence > 1 ? 'Recurring reservations created.' : 'Reservation created.',
    );
    if (result) {
      setGuestName('');
      await checkCapacity();
    }
  }

  async function addWaitlist() {
    const row = await run(
      () =>
        json<WaitlistEntry>('/growth/waitlist', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            guestName,
            guestEmail: guestEmail || undefined,
            partySize,
            desiredStartsAt: isoFromLocal(startsAt),
            desiredEndsAt: isoFromLocal(endsAt),
          }),
        }),
      'Guest added to the waitlist.',
    );
    if (row) await loadWaitlist();
  }

  async function loadTimeline() {
    const from = new Date(isoFromLocal(startsAt));
    const to = new Date(from.getTime() + 24 * 60 * 60_000);
    const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
    const data = await run(() =>
      json<JsonRecord>(`/growth/reservations/timeline/range?${params}`),
    );
    if (data) setTimeline(data);
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
      <div className="space-y-4 rounded-lg border p-4">
        <div>
          <h2 className="font-semibold">Capacity & booking</h2>
          <p className="text-sm text-muted-foreground">
            Staff booking and public booking resolve through the same resource-capacity engine.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Start">
            <input className="w-full rounded-md border bg-background p-2" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </Field>
          <Field label="End">
            <input className="w-full rounded-md border bg-background p-2" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </Field>
          <Field label="Party size">
            <input className="w-full rounded-md border bg-background p-2" type="number" min={1} value={partySize} onChange={(e) => setPartySize(Number(e.target.value))} />
          </Field>
          <Field label="Weekly occurrences">
            <input className="w-full rounded-md border bg-background p-2" type="number" min={1} max={24} value={recurrence} onChange={(e) => setRecurrence(Number(e.target.value))} />
          </Field>
          <Field label="Guest name">
            <input className="w-full rounded-md border bg-background p-2" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
          </Field>
          <Field label="Guest email">
            <input className="w-full rounded-md border bg-background p-2" type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Action onClick={() => void checkCapacity()}>Check capacity</Action>
          <Action onClick={() => void createReservation()} disabled={!guestName.trim()}>
            Create booking
          </Action>
          <Action onClick={() => void addWaitlist()} disabled={!guestName.trim()}>
            Add waitlist
          </Action>
          <Action onClick={() => void loadTimeline()}>Load timeline</Action>
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Available resources</h3>
          {capacity.length === 0 ? (
            <p className="text-sm text-muted-foreground">Run a capacity check for this interval.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {capacity.map((resource) => (
                <div key={resource.id} className="rounded-md border p-3 text-sm">
                  <div className="font-medium">{resource.name}</div>
                  <div className="text-muted-foreground">
                    {resource.type ?? 'Resource'} · capacity {resource.capacity ?? 'unlimited'} · buffers {resource.bufferBeforeMinutes}/{resource.bufferAfterMinutes} min
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {timeline ? <JsonDetails title="Timeline evidence" value={timeline} /> : null}
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Waitlist</h2>
            <p className="text-sm text-muted-foreground">Offers expire server-side and claims re-check capacity.</p>
          </div>
          <Action onClick={() => void loadWaitlist()}>Refresh</Action>
        </div>
        {waitlist.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active entries.</p>
        ) : (
          waitlist.map((entry) => (
            <div key={entry.id} className="space-y-2 rounded-md border p-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="font-medium">{entry.guestName}</span>
                <span>{entry.status}</span>
              </div>
              <div className="text-muted-foreground">Party {entry.partySize} · {new Date(entry.desiredStartsAt).toLocaleString()}</div>
              <div className="flex gap-2">
                {entry.status === 'WAITING' ? (
                  <Action
                    onClick={() =>
                      void run(
                        () => json(`/growth/waitlist/${entry.id}/offer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ offerMinutes: 15 }) }),
                        'Waitlist slot offered.',
                      ).then(loadWaitlist)
                    }
                  >
                    Offer
                  </Action>
                ) : null}
                {entry.status === 'OFFERED' ? (
                  <Action
                    onClick={() =>
                      void run(
                        () => json(`/growth/waitlist/${entry.id}/claim`, { method: 'POST' }),
                        'Waitlist offer claimed.',
                      ).then(loadWaitlist)
                    }
                  >
                    Claim
                  </Action>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function PromotionsPanel({ run }: { run: Runner }) {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [percent, setPercent] = useState(10);
  const [priority, setPriority] = useState(0);
  const [quoteSubtotal, setQuoteSubtotal] = useState(10000);
  const [quote, setQuote] = useState<JsonRecord | null>(null);

  const load = useCallback(async () => {
    const rows = await run(() => json<Promotion[]>('/growth/promotions'));
    if (rows) setPromotions(rows);
  }, [run]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    const row = await run(
      () =>
        json('/growth/promotions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name,
            code: code || undefined,
            kind: 'PERCENT',
            valueBps: Math.round(percent * 100),
            priority,
            requiresCode: Boolean(code),
            conditions: [],
            benefits: [{ kind: 'PERCENT', value: { valueBps: Math.round(percent * 100) } }],
          }),
        }),
      'Promotion created.',
    );
    if (row) {
      setName('');
      setCode('');
      await load();
    }
  }

  async function preview() {
    const result = await run(() =>
      json<JsonRecord>('/growth/pricing/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subtotalMinor: quoteSubtotal,
          promotionIds: promotions.filter((p) => p.active).map((p) => p.id),
          context: { at: new Date().toISOString(), bookingChannel: 'STAFF' },
        }),
      }),
    );
    if (result) setQuote(result);
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_1.25fr]">
      <div className="space-y-4 rounded-lg border p-4">
        <div>
          <h2 className="font-semibold">Promotion rule</h2>
          <p className="text-sm text-muted-foreground">Server-side rule applications store immutable explanations and snapshots.</p>
        </div>
        <Field label="Name"><input className="w-full rounded-md border bg-background p-2" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Code (optional)"><input className="w-full rounded-md border bg-background p-2" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Percent"><input className="w-full rounded-md border bg-background p-2" type="number" min={0} max={100} value={percent} onChange={(e) => setPercent(Number(e.target.value))} /></Field>
          <Field label="Priority"><input className="w-full rounded-md border bg-background p-2" type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} /></Field>
        </div>
        <Action onClick={() => void create()} disabled={!name.trim()}>Create rule</Action>

        <div className="border-t pt-4">
          <h3 className="mb-3 text-sm font-semibold">Deterministic quote preview</h3>
          <Field label="Subtotal (minor units)"><input className="w-full rounded-md border bg-background p-2" type="number" min={0} value={quoteSubtotal} onChange={(e) => setQuoteSubtotal(Number(e.target.value))} /></Field>
          <div className="mt-3"><Action onClick={() => void preview()}>Evaluate rules</Action></div>
          {quote ? <JsonDetails title="Pricing explanation" value={quote} /> : null}
        </div>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center justify-between"><h2 className="font-semibold">Rules</h2><Action onClick={() => void load()}>Refresh</Action></div>
        {promotions.map((promotion) => (
          <div key={promotion.id} className="rounded-md border p-3 text-sm">
            <div className="flex justify-between gap-3"><span className="font-medium">{promotion.name}</span><span>{promotion.active ? 'Active' : 'Inactive'}</span></div>
            <div className="text-muted-foreground">{promotion.code || 'Automatic'} · {promotion.kind} · priority {promotion.priority}</div>
            <div className="mt-1 text-xs text-muted-foreground">{promotion.conditions?.length ?? 0} condition(s) · {promotion.benefits?.length ?? 0} benefit(s)</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CustomersPanel({ run }: { run: Runner }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [history, setHistory] = useState<JsonRecord | null>(null);
  const [mergeId, setMergeId] = useState('');

  const load = useCallback(async () => {
    const rows = await run(() => json<Customer[]>('/growth/customers'));
    if (rows) setCustomers(rows);
  }, [run]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    const row = await run(
      () =>
        json<Customer>('/growth/customers', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name, email: email || undefined, phone: phone || undefined }),
        }),
      'Customer created or matched to an existing identity.',
    );
    if (row) {
      setSelectedId(row.id);
      await load();
    }
  }

  async function loadHistory(id = selectedId) {
    if (!id) return;
    const row = await run(() => json<JsonRecord>(`/growth/customers/${id}/history`));
    if (row) setHistory(row);
  }

  async function merge() {
    if (!selectedId || !mergeId) return;
    const row = await run(
      () =>
        json(`/growth/customers/${selectedId}/merge`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mergedCustomerId: mergeId, reason: 'Operator-confirmed duplicate' }),
        }),
      'Duplicate customer merged with audit evidence.',
    );
    if (row) {
      setMergeId('');
      await load();
      await loadHistory(selectedId);
    }
  }

  const selected = useMemo(() => customers.find((c) => c.id === selectedId), [customers, selectedId]);

  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_1.25fr]">
      <div className="space-y-4 rounded-lg border p-4">
        <div><h2 className="font-semibold">Customer identity</h2><p className="text-sm text-muted-foreground">Anonymous GuestChecks remain valid; create a CRM profile only when the guest is identified.</p></div>
        <Field label="Name"><input className="w-full rounded-md border bg-background p-2" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Email"><input className="w-full rounded-md border bg-background p-2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Phone"><input className="w-full rounded-md border bg-background p-2" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Action onClick={() => void create()} disabled={!email.trim() && !phone.trim()}>Create / match</Action>

        {selected ? (
          <div className="space-y-3 border-t pt-4">
            <h3 className="font-medium">Selected: {selected.name || selected.email || selected.phone || selected.id}</h3>
            <Field label="Merge duplicate customer ID into selected"><input className="w-full rounded-md border bg-background p-2 font-mono text-xs" value={mergeId} onChange={(e) => setMergeId(e.target.value)} /></Field>
            <div className="flex gap-2"><Action onClick={() => void loadHistory()}>History</Action><Action onClick={() => void merge()} disabled={!mergeId}>Merge duplicate</Action></div>
          </div>
        ) : null}
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center justify-between"><h2 className="font-semibold">Customers</h2><Action onClick={() => void load()}>Refresh</Action></div>
        <div className="grid gap-2 sm:grid-cols-2">
          {customers.map((customer) => (
            <button key={customer.id} type="button" onClick={() => { setSelectedId(customer.id); void loadHistory(customer.id); }} className={`rounded-md border p-3 text-left text-sm ${selectedId === customer.id ? 'ring-2 ring-foreground' : ''}`}>
              <div className="font-medium">{customer.name || customer.email || customer.phone || 'Customer'}</div>
              <div className="text-xs text-muted-foreground">{customer.email || 'No email'} · {customer.phone || 'No phone'}</div>
            </button>
          ))}
        </div>
        {history ? <JsonDetails title="Membership, visits, loyalty & stored value" value={history} /> : null}
      </div>
    </section>
  );
}

function EventsPanel({ run }: { run: Runner }) {
  const [eventId, setEventId] = useState('');
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [subtotalMinor, setSubtotalMinor] = useState(100000);
  const [depositMinor, setDepositMinor] = useState(20000);
  const [resourceId, setResourceId] = useState('');
  const [startsAt, setStartsAt] = useState(localValue());
  const [endsAt, setEndsAt] = useState(localValue(new Date(Date.now() + 4 * 60 * 60_000)));
  const [checklistLabel, setChecklistLabel] = useState('');

  async function load() {
    if (!eventId) return;
    const row = await run(() => json<EventDetail>(`/growth/events/${eventId}`));
    if (row) setDetail(row);
  }

  async function action(path: string, body?: unknown, message?: string) {
    if (!eventId) return;
    const row = await run(
      () => json(path, { method: 'POST', headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }),
      message,
    );
    if (row) await load();
  }

  const acceptedProposal = detail?.proposals.find((proposal) => proposal.status === 'ACCEPTED');
  const latestProposal = detail?.proposals[0];

  return (
    <section className="space-y-6">
      <div className="rounded-lg border p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <Field label="Event request ID"><input className="w-full rounded-md border bg-background p-2 font-mono text-xs" value={eventId} onChange={(e) => setEventId(e.target.value)} /></Field>
          <div className="self-end"><Action onClick={() => void load()} disabled={!eventId}>Open event</Action></div>
        </div>
      </div>

      {detail ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="space-y-4 rounded-lg border p-4">
            <div><h2 className="font-semibold">Commercial lifecycle</h2><p className="text-sm text-muted-foreground">Current state: <strong>{detail.state}</strong></p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Proposal subtotal (minor)"><input className="w-full rounded-md border bg-background p-2" type="number" value={subtotalMinor} onChange={(e) => setSubtotalMinor(Number(e.target.value))} /></Field>
              <Field label="Required deposit (minor)"><input className="w-full rounded-md border bg-background p-2" type="number" value={depositMinor} onChange={(e) => setDepositMinor(Number(e.target.value))} /></Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Action onClick={() => void action(`/growth/events/${eventId}/proposals`, { subtotalMinor, depositMinor, terms: { schemaVersion: 1, source: 'growth-workspace' } }, 'Proposal created.')}>Create proposal</Action>
              {latestProposal?.id ? <Action onClick={() => void action(`/growth/events/proposals/${String(latestProposal.id)}/send`, undefined, 'Proposal marked sent.')}>Send latest</Action> : null}
              {latestProposal?.id && latestProposal.status !== 'ACCEPTED' ? <Action onClick={() => void action(`/growth/events/proposals/${String(latestProposal.id)}/accept`, undefined, 'Proposal accepted.')}>Accept latest</Action> : null}
            </div>

            <div className="border-t pt-4">
              <h3 className="mb-3 text-sm font-semibold">Resource hold</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Resource ID"><input className="w-full rounded-md border bg-background p-2 font-mono text-xs" value={resourceId} onChange={(e) => setResourceId(e.target.value)} /></Field>
                <div />
                <Field label="Start"><input className="w-full rounded-md border bg-background p-2" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></Field>
                <Field label="End"><input className="w-full rounded-md border bg-background p-2" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></Field>
              </div>
              <div className="mt-3"><Action disabled={!resourceId} onClick={() => void action(`/growth/events/${eventId}/holds`, { resourceId, startsAt: isoFromLocal(startsAt), endsAt: isoFromLocal(endsAt) }, 'Resource held.')}>Create hold</Action></div>
            </div>

            <div className="flex flex-wrap gap-2 border-t pt-4">
              {detail.state === 'CONFIRMED' ? <Action onClick={() => void action(`/growth/events/${eventId}/start`, {}, 'Event GuestCheck started.')}>Start event</Action> : null}
              {detail.state === 'IN_PROGRESS' ? <Action onClick={() => void action(`/growth/events/${eventId}/final-payment`, undefined, 'Event moved to final payment.')}>Final payment</Action> : null}
              {detail.state === 'FINAL_PAYMENT' ? <Action onClick={() => void action(`/growth/events/${eventId}/complete`, undefined, 'Event completed after settlement.')}>Complete</Action> : null}
              {!['COMPLETED', 'CANCELED'].includes(detail.state) ? <Action onClick={() => void action(`/growth/events/${eventId}/cancel`, undefined, 'Event canceled.')}>Cancel</Action> : null}
            </div>
            {acceptedProposal ? <JsonDetails title="Accepted proposal" value={acceptedProposal} /> : null}
          </div>

          <div className="space-y-4 rounded-lg border p-4">
            <div><h2 className="font-semibold">Execution checklist & profitability</h2><p className="text-sm text-muted-foreground">Final completion is blocked until checklist and GuestCheck settlement gates pass.</p></div>
            <div className="flex gap-2">
              <input className="min-w-0 flex-1 rounded-md border bg-background p-2" placeholder="Checklist item" value={checklistLabel} onChange={(e) => setChecklistLabel(e.target.value)} />
              <Action disabled={!checklistLabel.trim()} onClick={() => void action(`/growth/events/${eventId}/checklist`, { label: checklistLabel }, 'Checklist item added.').then(() => setChecklistLabel(''))}>Add</Action>
            </div>
            <div className="space-y-2">
              {detail.checklist.map((item) => (
                <div key={String(item.id)} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                  <span>{String(item.label ?? 'Checklist item')}</span>
                  <Action onClick={() => void action(`/growth/events/checklist/${String(item.id)}/status`, { status: item.status === 'DONE' ? 'OPEN' : 'DONE' }, 'Checklist updated.')}>{item.status === 'DONE' ? 'Reopen' : 'Done'}</Action>
                </div>
              ))}
            </div>
            {detail.profitability ? <JsonDetails title="Profitability evidence" value={detail.profitability} /> : null}
            <JsonDetails title="Event detail" value={detail} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

function Action({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="rounded-md border bg-background px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50">
      {children}
    </button>
  );
}

function JsonDetails({ title, value }: { title: string; value: unknown }) {
  return (
    <details className="mt-3 rounded-md border p-3 text-xs">
      <summary className="cursor-pointer font-medium">{title}</summary>
      <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}
