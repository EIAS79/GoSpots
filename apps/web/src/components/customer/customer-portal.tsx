"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type ReservationSummary = {
  id: string;
  guestName: string;
  partySize: number;
  startsAt: string;
  endsAt: string;
  status: string;
};

type PortalSnapshot = {
  customer: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    marketingConsent: boolean;
    consentSource: string | null;
  };
  upcomingReservations: ReservationSummary[];
  bookingHistory: ReservationSummary[];
  visitHistory: Array<{
    id: string;
    completedAt: string;
    settledAmountMinor: number | null;
    currency: string | null;
  }>;
  membership: null | {
    tierId: string;
    effectiveStatus: string;
    joinedAt: string;
    expiresAt: string | null;
  };
  loyalty: {
    balance: number;
    entries: Array<{ id: string; type: string; points: number; createdAt: string }>;
  };
  packages: Array<{
    account: {
      id: string;
      unitKind: string;
      status: string;
      expiresAt: string | null;
    };
    balanceUnits: number;
  }>;
  storedValue: Array<{
    account: { id: string; currency: string; status: string };
    balanceMinor: number;
  }>;
  documents: Array<{
    id: string;
    kind: string;
    state: string;
    documentNumber: string | null;
    issueDate: string;
    currency: string;
    grossAmount: string;
  }>;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatMinor(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(value / 100);
}

function reservationList(
  rows: ReservationSummary[],
  empty: string,
) {
  return rows.length ? (
    <ul className="mt-4 divide-y divide-border">
      {rows.map((reservation) => (
        <li
          key={reservation.id}
          className="flex flex-wrap items-center justify-between gap-3 py-3"
        >
          <span>
            <span className="block font-medium">
              {formatDate(reservation.startsAt)}
            </span>
            <span className="text-sm text-muted-foreground">
              Party of {reservation.partySize} · {reservation.status}
            </span>
          </span>
        </li>
      ))}
    </ul>
  ) : (
    <p className="mt-4 text-sm text-muted-foreground">{empty}</p>
  );
}

export function CustomerPortal({ token }: { token: string }) {
  const [snapshot, setSnapshot] = useState<PortalSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingConsent, setSavingConsent] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profilePhone, setProfilePhone] = useState("");

  const endpoint = useMemo(
    () => `/api/v1/growth/phase9/portal/${encodeURIComponent(token)}`,
    [token],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? "This customer portal link is invalid or has expired."
            : "Customer portal data could not be loaded.",
        );
      }
      setSnapshot((await response.json()) as PortalSnapshot);
    } catch (reason) {
      setSnapshot(null);
      setError(
        reason instanceof Error ? reason.message : "Customer portal unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!snapshot) return;
    setProfileName(snapshot.customer.name ?? "");
    setProfileEmail(snapshot.customer.email ?? "");
    setProfilePhone(snapshot.customer.phone ?? "");
  }, [snapshot]);

  async function changeConsent(granted: boolean) {
    if (!snapshot || savingConsent) return;
    setSavingConsent(true);
    setError(null);
    try {
      const response = await fetch(`${endpoint}/marketing-consent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ granted }),
      });
      if (!response.ok) {
        throw new Error("Consent preference could not be saved.");
      }
      setSnapshot({
        ...snapshot,
        customer: {
          ...snapshot.customer,
          marketingConsent: granted,
          consentSource: "CUSTOMER_PORTAL",
        },
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Consent update failed.");
    } finally {
      setSavingConsent(false);
    }
  }

  async function saveProfile() {
    if (!snapshot || savingProfile) return;
    setSavingProfile(true);
    setError(null);
    try {
      const response = await fetch(`${endpoint}/profile`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: profileName.trim() || null,
          email: profileEmail.trim() || null,
          phone: profilePhone.trim() || null,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { message?: string | string[] }
          | null;
        const detail = Array.isArray(payload?.message)
          ? payload?.message.join(" ")
          : payload?.message;
        throw new Error(detail || "Profile details could not be saved.");
      }
      const customer = (await response.json()) as {
        id: string;
        name: string | null;
        email: string | null;
        phone: string | null;
      };
      setSnapshot({
        ...snapshot,
        customer: { ...snapshot.customer, ...customer },
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Profile update failed.");
    } finally {
      setSavingProfile(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-5xl px-6 py-16" aria-live="polite">
          <p className="text-muted-foreground">Loading your GoSpots account…</p>
        </div>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-2xl px-6 py-16">
          <section className="rounded-2xl border border-border bg-card p-8">
            <h1 className="text-2xl font-semibold">Customer portal unavailable</h1>
            <p className="mt-3 text-muted-foreground" role="alert">
              {error ?? "This portal link cannot be used."}
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-6 min-h-11 rounded-lg bg-primary px-5 font-medium text-primary-foreground"
            >
              Try again
            </button>
          </section>
        </div>
      </main>
    );
  }

  const displayName = snapshot.customer.name || "Guest";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <header className="mb-8">
          <p className="text-sm font-medium text-muted-foreground">
            GoSpots customer portal
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {displayName}
          </h1>
          <p className="mt-2 text-muted-foreground">
            Memberships, benefits, reservations, value balances and documents
            from your venue account.
          </p>
        </header>

        {error ? (
          <div
            className="mb-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        <section className="mb-6 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Profile</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Keep the contact details used for your venue account up to date.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Name</span>
              <input
                aria-label="Name"
                value={profileName}
                onChange={(event) => setProfileName(event.target.value)}
                className="min-h-11 w-full rounded-lg border border-border bg-background px-3"
                autoComplete="name"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Email</span>
              <input
                aria-label="Email"
                type="email"
                value={profileEmail}
                onChange={(event) => setProfileEmail(event.target.value)}
                className="min-h-11 w-full rounded-lg border border-border bg-background px-3"
                autoComplete="email"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Phone</span>
              <input
                aria-label="Phone"
                type="tel"
                value={profilePhone}
                onChange={(event) => setProfilePhone(event.target.value)}
                className="min-h-11 w-full rounded-lg border border-border bg-background px-3"
                autoComplete="tel"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={savingProfile}
            onClick={() => void saveProfile()}
            className="mt-4 min-h-11 rounded-lg bg-primary px-5 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingProfile ? "Saving profile…" : "Save profile"}
          </button>
        </section>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">Membership</h2>
            {snapshot.membership ? (
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <dt className="text-muted-foreground">Status</dt>
                <dd className="font-medium">
                  {snapshot.membership.effectiveStatus}
                </dd>
                <dt className="text-muted-foreground">Joined</dt>
                <dd>{formatDate(snapshot.membership.joinedAt)}</dd>
                <dt className="text-muted-foreground">Expires</dt>
                <dd>{formatDate(snapshot.membership.expiresAt)}</dd>
              </dl>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                No membership is currently linked.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">Loyalty</h2>
            <p className="mt-4 text-3xl font-semibold">
              {snapshot.loyalty.balance}
            </p>
            <p className="text-sm text-muted-foreground">points available</p>
          </section>

          <section className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">Prepaid packages</h2>
            {snapshot.packages.length ? (
              <ul className="mt-4 space-y-3">
                {snapshot.packages.map(({ account, balanceUnits }) => (
                  <li
                    key={account.id}
                    className="flex items-center justify-between gap-4 rounded-xl border border-border p-3"
                  >
                    <span>
                      <span className="block font-medium">
                        {account.unitKind}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {account.status}
                      </span>
                    </span>
                    <strong>{balanceUnits}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                No prepaid package balance.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">Stored value</h2>
            {snapshot.storedValue.length ? (
              <ul className="mt-4 space-y-3">
                {snapshot.storedValue.map(({ account, balanceMinor }) => (
                  <li
                    key={account.id}
                    className="flex items-center justify-between rounded-xl border border-border p-3"
                  >
                    <span className="text-sm text-muted-foreground">
                      {account.status}
                    </span>
                    <strong>
                      {formatMinor(balanceMinor, account.currency)}
                    </strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                No stored-value balance.
              </p>
            )}
          </section>
        </div>

        <section className="mt-6 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Upcoming reservations</h2>
          {reservationList(
            snapshot.upcomingReservations,
            "No upcoming reservations.",
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Booking history</h2>
          {reservationList(snapshot.bookingHistory, "No past bookings yet.")}
        </section>

        <section className="mt-6 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Receipts and invoices</h2>
          {snapshot.documents.length ? (
            <ul className="mt-4 divide-y divide-border">
              {snapshot.documents.map((document) => (
                <li
                  key={document.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                >
                  <span>
                    <span className="block font-medium">
                      {document.kind}{" "}
                      {document.documentNumber
                        ? `#${document.documentNumber}`
                        : ""}
                    </span>
                    <span className="text-muted-foreground">
                      {formatDate(document.issueDate)} · {document.state}
                    </span>
                  </span>
                  <strong>
                    {Number(document.grossAmount).toFixed(2)} {document.currency}
                  </strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              No customer documents are linked yet.
            </p>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Privacy and consent</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Marketing consent is separate from the operational records the venue
            must retain for legitimate business and legal purposes.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-sm">
              Marketing:{" "}
              <strong>
                {snapshot.customer.marketingConsent ? "Allowed" : "Not allowed"}
              </strong>
            </span>
            <button
              type="button"
              disabled={savingConsent}
              onClick={() =>
                void changeConsent(!snapshot.customer.marketingConsent)
              }
              className="min-h-11 rounded-lg border border-border px-4 font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingConsent
                ? "Saving…"
                : snapshot.customer.marketingConsent
                  ? "Withdraw marketing consent"
                  : "Allow marketing"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
