'use client';

import { useCallback, useEffect, useState } from 'react';

type BookingStatus = {
  id: string;
  guestName: string;
  partySize: number;
  startsAt: string;
  endsAt: string;
  status: string;
  resource: {
    id: string;
    name: string;
    type: string | null;
    capacity: number | null;
  } | null;
};

type DepositStatus = {
  reservationId: string;
  requiredMinor: number;
  balanceMinor: number;
  appliedMinor: number;
  unappliedMinor: number;
  remainingMinor: number;
  currency: string;
  paid: boolean;
  latestAttempt?: {
    status: string;
    amountMinor: number;
    createdAt: string;
    expiresAt?: string | null;
    succeededAt?: string | null;
  } | null;
};

function localValue(iso: string) {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
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

export function PublicBookingManage({
  slug,
  reservationId,
  token,
}: {
  slug: string;
  reservationId: string;
  token: string;
}) {
  const [booking, setBooking] = useState<BookingStatus | null>(null);
  const [deposit, setDeposit] = useState<DepositStatus | null>(null);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [partySize, setPartySize] = useState(1);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!reservationId || !token) return;
    setBusy(true);
    setError('');
    try {
      const encodedSlug = encodeURIComponent(slug);
      const encodedId = encodeURIComponent(reservationId);
      const encodedToken = encodeURIComponent(token);
      const [bookingResult, depositResult] = await Promise.all([
        request<BookingStatus>(
          `/public/growth/${encodedSlug}/reservations/${encodedId}/status?token=${encodedToken}`,
        ),
        request<DepositStatus>(
          `/public/growth/${encodedSlug}/reservations/${encodedId}/deposit?token=${encodedToken}`,
        ),
      ]);
      setBooking(bookingResult);
      setDeposit(depositResult);
      setStartsAt(localValue(bookingResult.startsAt));
      setEndsAt(localValue(bookingResult.endsAt));
      setPartySize(bookingResult.partySize);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load booking.');
    } finally {
      setBusy(false);
    }
  }, [reservationId, slug, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function reschedule() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request(
        `/public/growth/${encodeURIComponent(slug)}/reservations/${encodeURIComponent(reservationId)}/reschedule`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            token,
            startsAt: new Date(startsAt).toISOString(),
            endsAt: new Date(endsAt).toISOString(),
            partySize,
          }),
        },
      );
      setNotice('Booking rescheduled.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reschedule.');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!window.confirm('Cancel this booking?')) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request(
        `/public/growth/${encodeURIComponent(slug)}/reservations/${encodeURIComponent(reservationId)}/cancel`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token, reason: 'Guest canceled online' }),
        },
      );
      setNotice('Booking canceled. Any refundable deposit remains visible to venue staff for settlement/refund handling.');
      setBooking((current) =>
        current ? { ...current, status: 'CANCELED' } : current,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to cancel.');
    } finally {
      setBusy(false);
    }
  }

  async function payDeposit() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await request<
        DepositStatus & {
          checkoutRequired: boolean;
          checkoutUrl: string | null;
        }
      >(
        `/public/growth/${encodeURIComponent(slug)}/reservations/${encodeURIComponent(reservationId)}/deposit/checkout`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token }),
        },
      );
      if (result.checkoutRequired && result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }
      setDeposit(result);
      setNotice('No additional deposit is required.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start deposit checkout.');
    } finally {
      setBusy(false);
    }
  }

  if (!reservationId || !token) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <div className="rounded-lg border p-4 text-sm">
          This booking link is incomplete. Open the manage-booking link issued when the reservation was created.
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-8">
      <header>
        <p className="text-sm text-muted-foreground">GoSpots booking management</p>
        <h1 className="text-2xl font-semibold">Manage reservation</h1>
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

      {booking ? (
        <section className="space-y-4 rounded-lg border p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">{booking.guestName}</h2>
              <p className="text-sm text-muted-foreground">
                {booking.resource?.name ?? 'Flexible resource'} · party {booking.partySize}
              </p>
            </div>
            <span className="rounded-md border px-3 py-1 text-sm font-medium">
              {booking.status}
            </span>
          </div>

          {!['CANCELED', 'COMPLETED', 'NO_SHOW'].includes(booking.status) ? (
            <>
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
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void reschedule()}
                >
                  Reschedule
                </button>
                <button
                  type="button"
                  className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void cancel()}
                >
                  Cancel booking
                </button>
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {deposit ? (
        <section className="space-y-4 rounded-lg border p-4 md:p-5">
          <div>
            <h2 className="font-semibold">Reservation deposit</h2>
            <p className="text-sm text-muted-foreground">
              Provider checkout is separate from the authoritative deposit ledger. Only verified payment webhooks update the paid balance.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Required" value={`${(deposit.requiredMinor / 100).toFixed(2)} ${deposit.currency}`} />
            <Metric label="Captured balance" value={`${(deposit.balanceMinor / 100).toFixed(2)} ${deposit.currency}`} />
            <Metric label="Remaining" value={`${(deposit.remainingMinor / 100).toFixed(2)} ${deposit.currency}`} />
          </div>
          {deposit.requiredMinor > 0 && deposit.remainingMinor > 0 && booking && !['CANCELED', 'COMPLETED', 'NO_SHOW'].includes(booking.status) ? (
            <button
              type="button"
              className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
              disabled={busy}
              onClick={() => void payDeposit()}
            >
              Pay deposit with Stripe
            </button>
          ) : null}
          {deposit.paid ? (
            <p className="text-sm font-medium">Deposit requirement is satisfied.</p>
          ) : null}
          {deposit.latestAttempt ? (
            <p className="text-xs text-muted-foreground">
              Latest checkout: {deposit.latestAttempt.status}
            </p>
          ) : null}
        </section>
      ) : null}

      <button
        type="button"
        className="rounded-md border px-3 py-2 text-sm font-medium"
        disabled={busy}
        onClick={() => void load()}
      >
        Refresh status
      </button>
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}
