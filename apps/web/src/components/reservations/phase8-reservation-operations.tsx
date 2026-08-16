'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

type View = 'day' | 'week' | 'timeline' | 'floor' | 'arrivals' | 'no-show' | 'waitlist';

type Resource = {
  id: string;
  name: string;
  type?: string | null;
};

type Reservation = {
  id: string;
  guestName: string;
  guestEmail?: string | null;
  guestPhone?: string | null;
  partySize: number;
  startsAt: string;
  endsAt: string;
  status: string;
  resourceId?: string | null;
  resource?: Resource | null;
};

type WaitlistEntry = {
  id: string;
  guestName: string;
  partySize: number;
  status: string;
  desiredStartsAt: string;
  desiredEndsAt: string;
  resourceId?: string | null;
};

type Timeline = {
  from: string;
  to: string;
  reservations: Reservation[];
  waitlist: WaitlistEntry[];
  sessions: Array<{ id: string; resourceId: string; status: string }>;
  eventHolds: Array<{ id: string; resourceId: string; startsAt: string; endsAt: string; status: string }>;
};

const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'floor', label: 'Floor' },
  { id: 'arrivals', label: 'Arrivals' },
  { id: 'no-show', label: 'No-show' },
  { id: 'waitlist', label: 'Waitlist' },
];

function dateInputValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function rangeFor(dateValue: string, days: number) {
  const start = new Date(`${dateValue}T00:00:00`);
  const end = new Date(start.getTime() + days * 24 * 60 * 60_000);
  return { from: start.toISOString(), to: end.toISOString() };
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message || `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

function reservationTime(row: Reservation) {
  return `${new Date(row.startsAt).toLocaleString()} – ${new Date(row.endsAt).toLocaleTimeString()}`;
}

function isUpcoming(row: Reservation) {
  return row.status === 'PENDING' || row.status === 'CONFIRMED';
}

export function Phase8ReservationOperations({ venuePath }: { venuePath: string }) {
  const [view, setView] = useState<View>('day');
  const [date, setDate] = useState(dateInputValue());
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const days = view === 'week' ? 7 : 1;
      const range = rangeFor(date, days);
      const params = new URLSearchParams(range);
      const data = await json<Timeline>(`/growth/reservations/timeline/range?${params}`);
      setTimeline(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load reservations.');
    } finally {
      setLoading(false);
    }
  }, [date, view]);

  useEffect(() => {
    void load();
  }, [load]);

  async function mutate(path: string, body?: unknown, message?: string) {
    setError('');
    setNotice('');
    try {
      await json(path, {
        method: 'POST',
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (message) setNotice(message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reservation action failed.');
    }
  }

  const reservations = timeline?.reservations ?? [];
  const arrivals = useMemo(() => reservations.filter(isUpcoming), [reservations]);
  const noShows = useMemo(
    () => reservations.filter((row) => row.status === 'NO_SHOW'),
    [reservations],
  );
  const floor = useMemo(() => {
    const byResource = new Map<string, { resource: Resource; rows: Reservation[] }>();
    for (const row of reservations) {
      if (!row.resource) continue;
      const current = byResource.get(row.resource.id) ?? { resource: row.resource, rows: [] };
      current.rows.push(row);
      byResource.set(row.resource.id, current);
    }
    return [...byResource.values()].sort((a, b) => a.resource.name.localeCompare(b.resource.name));
  }, [reservations]);

  const visibleRows = view === 'arrivals' ? arrivals : view === 'no-show' ? noShows : reservations;

  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">Venue: {venuePath}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Reservation operations</h1>
        <p className="text-sm text-muted-foreground">
          Day, week, timeline, floor, arrivals, no-show and waitlist views use the canonical reservation and capacity state.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Operating date</span>
          <input
            className="block rounded-md border bg-background px-3 py-2"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <button className="rounded-md border px-3 py-2 text-sm font-medium" type="button" onClick={() => void load()}>
          Refresh
        </button>
        <span className="text-sm text-muted-foreground">{loading ? 'Loading…' : `${reservations.length} reservations`}</span>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Reservation views">
        {VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setView(item.id)}
            className={`rounded-md border px-3 py-2 text-sm font-medium ${view === item.id ? 'bg-foreground text-background' : 'bg-background'}`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {error ? <div role="alert" className="rounded-md border p-3 text-sm">{error}</div> : null}
      {notice ? <div role="status" className="rounded-md border p-3 text-sm">{notice}</div> : null}

      {view === 'floor' ? (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {floor.length === 0 ? <Empty text="No assigned reservation resources in this range." /> : floor.map(({ resource, rows }) => (
            <article key={resource.id} className="rounded-lg border p-4">
              <div className="font-semibold">{resource.name}</div>
              <div className="text-xs text-muted-foreground">{resource.type ?? 'Resource'}</div>
              <div className="mt-3 space-y-2">
                {rows.map((row) => (
                  <div key={row.id} className="rounded-md border p-2 text-sm">
                    <div className="flex justify-between gap-2"><span>{row.guestName}</span><span>{row.status}</span></div>
                    <div className="text-xs text-muted-foreground">{reservationTime(row)}</div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>
      ) : view === 'waitlist' ? (
        <Waitlist rows={timeline?.waitlist ?? []} mutate={mutate} />
      ) : (
        <section className="space-y-3">
          {visibleRows.length === 0 ? <Empty text={view === 'no-show' ? 'No no-shows in this range.' : 'No reservations in this range.'} /> : visibleRows.map((row) => (
            <article key={row.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{row.guestName}</div>
                  <div className="text-sm text-muted-foreground">Party {row.partySize} · {reservationTime(row)}</div>
                  <div className="text-sm text-muted-foreground">{row.resource?.name ?? 'Resource not assigned'} · {row.status}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {isUpcoming(row) && row.resourceId ? (
                    <button className="rounded-md border px-3 py-2 text-sm" type="button" onClick={() => void mutate(`/growth/reservations/${row.id}/arrival`, undefined, 'Reservation arrived and was converted to its active check/session.')}>Arrive</button>
                  ) : null}
                  {isUpcoming(row) ? (
                    <button className="rounded-md border px-3 py-2 text-sm" type="button" onClick={() => void mutate(`/growth/reservations/${row.id}/outcome`, { outcome: 'NO_SHOW', reason: 'Marked by staff from reservation operations' }, 'Reservation marked no-show and deposit policy applied.')}>Mark no-show</button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

function Waitlist({ rows, mutate }: { rows: WaitlistEntry[]; mutate: (path: string, body?: unknown, message?: string) => Promise<void> }) {
  if (rows.length === 0) return <Empty text="No waitlist entries in this range." />;
  return (
    <section className="space-y-3">
      {rows.map((row) => (
        <article key={row.id} className="rounded-lg border p-4">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <div className="font-semibold">{row.guestName}</div>
              <div className="text-sm text-muted-foreground">Party {row.partySize} · {new Date(row.desiredStartsAt).toLocaleString()} · {row.status}</div>
            </div>
            <div className="flex gap-2">
              {row.status === 'WAITING' ? <button className="rounded-md border px-3 py-2 text-sm" type="button" onClick={() => void mutate(`/growth/waitlist/${row.id}/offer`, { offerMinutes: 15 }, 'Waitlist slot offered.')}>Offer</button> : null}
              {row.status === 'OFFERED' ? <button className="rounded-md border px-3 py-2 text-sm" type="button" onClick={() => void mutate(`/growth/waitlist/${row.id}/claim`, undefined, 'Waitlist offer converted to a reservation.')}>Claim</button> : null}
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-lg border p-6 text-sm text-muted-foreground">{text}</div>;
}
