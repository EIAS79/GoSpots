'use client';

import { useState } from 'react';

type CapacityResource = {
  id: string;
  name: string;
  type: string | null;
  capacity: number | null;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
};

type BookingResult = {
  recurrenceSeriesId: string | null;
  reservations: Array<{
    reservationId: string;
    resourceId: string;
    startsAt: string;
    endsAt: string;
    guestToken?: string;
  }>;
};

function localValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIso(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: 'same-origin',
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;
    throw new Error(payload?.message || `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export function PublicGrowthBooking({ slug }: { slug: string }) {
  const [startsAt, setStartsAt] = useState(
    localValue(new Date(Date.now() + 60 * 60_000)),
  );
  const [endsAt, setEndsAt] = useState(
    localValue(new Date(Date.now() + 2 * 60 * 60_000)),
  );
  const [partySize, setPartySize] = useState(2);
  const [resourceType, setResourceType] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [available, setAvailable] = useState<CapacityResource[]>([]);
  const [selectedResourceId, setSelectedResourceId] = useState('');
  const [booking, setBooking] = useState<BookingResult | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function run<T>(work: () => Promise<T>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      return await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed.');
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function checkCapacity() {
    const params = new URLSearchParams({
      startsAt: toIso(startsAt),
      endsAt: toIso(endsAt),
      partySize: String(partySize),
    });
    if (resourceType.trim()) params.set('resourceType', resourceType.trim());
    const result = await run(() =>
      request<{ available: CapacityResource[] }>(
        `/public/growth/${encodeURIComponent(slug)}/capacity?${params}`,
      ),
    );
    if (result) {
      setAvailable(result.available);
      if (
        selectedResourceId &&
        !result.available.some((resource) => resource.id === selectedResourceId)
      ) {
        setSelectedResourceId('');
      }
      if (result.available.length === 0) {
        setNotice('No matching resource is currently available. You can join the waitlist.');
      }
    }
  }

  async function createBooking() {
    const result = await run(() =>
      request<BookingResult>(
        `/public/growth/${encodeURIComponent(slug)}/reservations`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            startsAt: toIso(startsAt),
            endsAt: toIso(endsAt),
            partySize,
            resourceId: selectedResourceId || undefined,
            resourceType: resourceType || undefined,
            guestName,
            guestEmail: guestEmail || undefined,
            guestPhone: guestPhone || undefined,
            notes: notes || undefined,
            sourceChannel: 'PUBLIC',
          }),
        },
      ),
    );
    if (result) {
      setBooking(result);
      setNotice('Booking confirmed. Save the manage-booking link below.');
    }
  }

  async function joinWaitlist() {
    const result = await run(() =>
      request<{ id: string }>(
        `/public/growth/${encodeURIComponent(slug)}/waitlist`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            resourceId: selectedResourceId || undefined,
            guestName,
            guestEmail: guestEmail || undefined,
            guestPhone: guestPhone || undefined,
            partySize,
            desiredStartsAt: toIso(startsAt),
            desiredEndsAt: toIso(endsAt),
            note: notes || undefined,
          }),
        },
      ),
    );
    if (result) {
      setNotice(`Waitlist entry created (${result.id}). The venue can offer a slot when capacity opens.`);
    }
  }

  const first = booking?.reservations[0];
  const manageHref =
    first?.guestToken && first.reservationId
      ? `/growth-booking/${encodeURIComponent(slug)}/manage?reservationId=${encodeURIComponent(first.reservationId)}&token=${encodeURIComponent(first.guestToken)}`
      : null;

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-8">
      <header className="space-y-2">
        <p className="text-sm text-muted-foreground">GoSpots venue booking</p>
        <h1 className="text-2xl font-semibold">Book a resource</h1>
        <p className="text-sm text-muted-foreground">
          Availability includes venue hours, existing reservations, active sessions,
          maintenance, event holds, resource capacity and configured buffers.
        </p>
      </header>

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

      <section className="space-y-4 rounded-lg border p-4 md:p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Start">
            <input
              className="w-full rounded-md border bg-background p-2"
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
            />
          </Field>
          <Field label="End">
            <input
              className="w-full rounded-md border bg-background p-2"
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </Field>
          <Field label="Party size">
            <input
              className="w-full rounded-md border bg-background p-2"
              type="number"
              min={1}
              max={500}
              value={partySize}
              onChange={(event) => setPartySize(Number(event.target.value))}
            />
          </Field>
          <Field label="Resource type (optional)">
            <input
              className="w-full rounded-md border bg-background p-2"
              placeholder="BILLIARD, BOWLING, KARAOKE…"
              value={resourceType}
              onChange={(event) => setResourceType(event.target.value.toUpperCase())}
            />
          </Field>
        </div>
        <button
          type="button"
          className="rounded-md border px-3 py-2 text-sm font-medium"
          disabled={busy}
          onClick={() => void checkCapacity()}
        >
          Check availability
        </button>

        {available.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {available.map((resource) => (
              <button
                key={resource.id}
                type="button"
                onClick={() => setSelectedResourceId(resource.id)}
                className={`rounded-md border p-3 text-left text-sm ${
                  selectedResourceId === resource.id ? 'ring-2 ring-foreground' : ''
                }`}
              >
                <div className="font-medium">{resource.name}</div>
                <div className="text-muted-foreground">
                  {resource.type ?? 'Resource'} · capacity {resource.capacity ?? '—'} ·
                  buffers {resource.bufferBeforeMinutes}/{resource.bufferAfterMinutes} min
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <section className="space-y-4 rounded-lg border p-4 md:p-5">
        <h2 className="font-semibold">Guest details</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input
              className="w-full rounded-md border bg-background p-2"
              value={guestName}
              onChange={(event) => setGuestName(event.target.value)}
            />
          </Field>
          <Field label="Email">
            <input
              className="w-full rounded-md border bg-background p-2"
              type="email"
              value={guestEmail}
              onChange={(event) => setGuestEmail(event.target.value)}
            />
          </Field>
          <Field label="Phone">
            <input
              className="w-full rounded-md border bg-background p-2"
              value={guestPhone}
              onChange={(event) => setGuestPhone(event.target.value)}
            />
          </Field>
          <Field label="Notes">
            <input
              className="w-full rounded-md border bg-background p-2"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
            disabled={busy || !guestName.trim() || (!guestEmail.trim() && !guestPhone.trim())}
            onClick={() => void createBooking()}
          >
            Confirm booking
          </button>
          <button
            type="button"
            className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
            disabled={busy || !guestName.trim() || (!guestEmail.trim() && !guestPhone.trim())}
            onClick={() => void joinWaitlist()}
          >
            Join waitlist
          </button>
        </div>
      </section>

      {manageHref ? (
        <section className="rounded-lg border p-4 md:p-5">
          <h2 className="font-semibold">Manage this booking</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This link contains the booking access token. Keep it private.
          </p>
          <a className="mt-3 inline-block rounded-md border px-3 py-2 text-sm font-medium" href={manageHref}>
            Open booking management
          </a>
        </section>
      ) : null}
    </main>
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
