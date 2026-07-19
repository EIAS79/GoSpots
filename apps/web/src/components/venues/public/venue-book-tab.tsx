"use client";

import { CalendarCheck, Mail, Phone } from "lucide-react";
import Link from "next/link";
import { PublicBookingRequestForm } from "@/components/reservations/public-booking-request-form";
import { PublicContactForm } from "@/components/venues/public/public-contact-form";
import type { PublicVenueDetail } from "@/lib/shop-settings-client";

export function VenueBookTab({
  venue,
  slug,
}: {
  venue: PublicVenueDetail;
  slug: string;
}) {
  const hasDigitalDining = Boolean(venue.features?.hasDigitalDining);
  const hasLegacyTables =
    venue.features?.hasTableReservations && !hasDigitalDining;

  const diningOptions = (venue.diningOfferings ?? [])
    .filter((o) => o.unitCount > 0)
    .map((o) => ({
      id: o.id,
      name: o.name,
      type: o.type,
      unitCount: o.unitCount,
    }));

  const gamingOptions = (venue.gamingOfferings ?? [])
    .filter((o) => o.unitCount > 0)
    .map((o) => ({
      id: o.id,
      name: o.name,
      type: o.type,
      unitCount: o.unitCount,
    }));

  return (
    <div className="space-y-12">
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-4">
        <p className="text-sm font-medium text-zinc-200">
          Dining &amp; events
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          {hasDigitalDining ? (
            <>
              Instant tables are on the{" "}
              <Link
                href={`/venue/${slug}?tab=dining`}
                className="font-medium text-amber-200 underline-offset-2 hover:underline"
              >
                Book a table
              </Link>{" "}
              tab. This page is for private event requests
              {gamingOptions.length > 0 ? (
                <>
                  ; for gaming stations use{" "}
                  <Link
                    href={`/venue/${slug}?tab=activities`}
                    className="font-medium text-amber-200 underline-offset-2 hover:underline"
                  >
                    Gaming floor
                  </Link>
                  .
                </>
              ) : (
                "."
              )}
            </>
          ) : (
            <>
              Request a table or private event. For gaming — PCs, consoles,
              billiards — use the{" "}
              <strong className="font-medium text-zinc-300">
                Gaming floor
              </strong>{" "}
              tab when available.
            </>
          )}
        </p>
      </div>

      {(venue.phone || venue.email) ? (
        <div className="flex flex-col gap-3 text-sm sm:flex-row sm:flex-wrap">
          {venue.phone ? (
            <a
              href={`tel:${venue.phone}`}
              className="inline-flex max-w-full items-center gap-2 rounded-lg border border-white/10 bg-zinc-900/50 px-4 py-2.5 text-zinc-300 transition hover:border-white/20 hover:text-amber-200"
            >
              <Phone size={16} className="shrink-0" />
              <span className="truncate">
                <span className="sm:hidden">Call</span>
                <span className="hidden sm:inline">Call {venue.phone}</span>
              </span>
            </a>
          ) : null}
          {venue.email ? (
            <a
              href={`mailto:${venue.email}`}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-900/50 px-4 py-2.5 text-zinc-300 transition hover:border-white/20 hover:text-amber-200"
            >
              Email venue
            </a>
          ) : null}
        </div>
      ) : null}

      {hasLegacyTables ? (
        <section id="book-table">
          <SectionLabel icon={CalendarCheck} label="Table reservation" />
          <div className="max-w-xl">
            <PublicBookingRequestForm
              slug={slug}
              mode="TABLE"
              diningOptions={diningOptions}
            />
          </div>
        </section>
      ) : null}

      <section id="book-event">
        <SectionLabel icon={CalendarCheck} label="Private events" />
        <div className="max-w-xl">
          <PublicBookingRequestForm
            slug={slug}
            mode="EVENT"
            diningOptions={diningOptions}
            gamingOptions={gamingOptions}
            description={
              hasDigitalDining
                ? "Birthdays, meetings, and parties — choose the dining area (or activity) from this venue’s live setup. Staff review against the same floor data as the dashboard."
                : undefined
            }
          />
        </div>
      </section>

      <section id="contact">
        <SectionLabel icon={Mail} label="Contact" />
        <div className="max-w-xl">
          <PublicContactForm slug={slug} />
        </div>
      </section>
    </div>
  );
}

function SectionLabel({
  icon: Icon,
  label,
}: {
  icon: typeof CalendarCheck;
  label: string;
}) {
  return (
    <h2 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
      <Icon size={14} className="text-amber-400/80" />
      {label}
    </h2>
  );
}
