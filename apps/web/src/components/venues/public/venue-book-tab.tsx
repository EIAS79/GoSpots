"use client";

import { CalendarCheck, Mail, Phone } from "lucide-react";
import Link from "next/link";
import { PublicBookingRequestForm } from "@/components/reservations/public-booking-request-form";
import { PublicContactForm } from "@/components/venues/public/public-contact-form";
import { VenueGuestDsarForm } from "@/components/venues/public/venue-guest-dsar-form";
import { usePublicPrefs } from "@/lib/public-prefs-context";
import type { PublicVenueDetail } from "@/lib/shop-settings-client";

export function VenueBookTab({
  venue,
  slug,
}: {
  venue: PublicVenueDetail;
  slug: string;
}) {
  const { t } = usePublicPrefs();
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
        <p className="text-sm font-medium text-[var(--color-foreground)]">
          {t("venuePage.book.diningEvents")}
        </p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-500">
          {hasDigitalDining ? (
            <>
              {t("venuePage.book.instantBefore")}{" "}
              <Link
                href={`/venue/${slug}?tab=dining`}
                className="font-medium text-amber-700 underline-offset-2 hover:underline dark:text-amber-200"
              >
                {t("venuePage.book.bookATable")}
              </Link>{" "}
              {t("venuePage.book.instantMid")}
              {gamingOptions.length > 0 ? (
                <>
                  {t("venuePage.book.instantGamingBefore")}{" "}
                  <Link
                    href={`/venue/${slug}?tab=activities`}
                    className="font-medium text-amber-700 underline-offset-2 hover:underline dark:text-amber-200"
                  >
                    {t("venuePage.book.gamingFloor")}
                  </Link>
                  {t("venuePage.book.instantEnd")}
                </>
              ) : (
                t("venuePage.book.instantEnd")
              )}
            </>
          ) : (
            <>
              {t("venuePage.book.legacyBefore")}{" "}
              <strong className="font-medium text-zinc-800 dark:text-zinc-300">
                {t("venuePage.book.gamingFloor")}
              </strong>{" "}
              {t("venuePage.book.legacyAfter")}
            </>
          )}
        </p>
      </div>

      {(venue.phone || venue.email) ? (
        <div className="flex flex-col gap-3 text-sm sm:flex-row sm:flex-wrap">
          {venue.phone ? (
            <a
              href={`tel:${venue.phone}`}
              className="inline-flex max-w-full items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-zinc-700 transition hover:border-amber-400/40 hover:text-amber-700 dark:text-zinc-300 dark:hover:text-amber-200"
            >
              <Phone size={16} className="shrink-0" />
              <span className="truncate">
                <span className="sm:hidden">{t("venuePage.book.call")}</span>
                <span className="hidden sm:inline">
                  {t("venuePage.book.callPhone", { phone: venue.phone })}
                </span>
              </span>
            </a>
          ) : null}
          {venue.email ? (
            <a
              href={`mailto:${venue.email}`}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-zinc-700 transition hover:border-amber-400/40 hover:text-amber-700 dark:text-zinc-300 dark:hover:text-amber-200"
            >
              {t("venuePage.book.emailVenue")}
            </a>
          ) : null}
        </div>
      ) : null}

      {hasLegacyTables ? (
        <section id="book-table">
          <SectionLabel
            icon={CalendarCheck}
            label={t("venuePage.book.tableReservation")}
          />
          <div className="max-w-xl">
            <PublicBookingRequestForm
              slug={slug}
              mode="TABLE"
              diningOptions={diningOptions}
              timezone={venue.timezone}
              venueLocale={venue.locale}
            />
          </div>
        </section>
      ) : null}

      <section id="book-event">
        <SectionLabel
          icon={CalendarCheck}
          label={t("venuePage.book.privateEvents")}
        />
        <div className="max-w-xl">
          <PublicBookingRequestForm
            slug={slug}
            mode="EVENT"
            diningOptions={diningOptions}
            gamingOptions={gamingOptions}
            timezone={venue.timezone}
            venueLocale={venue.locale}
            description={
              hasDigitalDining
                ? t("venuePage.book.eventDescDigital")
                : undefined
            }
          />
        </div>
      </section>

      <section id="contact">
        <SectionLabel icon={Mail} label={t("venuePage.book.contact")} />
        <div className="max-w-xl space-y-6">
          <PublicContactForm slug={slug} />
          <VenueGuestDsarForm slug={slug} />
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
