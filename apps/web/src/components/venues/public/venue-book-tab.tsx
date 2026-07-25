"use client";

import { CalendarCheck, Shield } from "lucide-react";
import Link from "next/link";
import { PublicBookingRequestForm } from "@/components/reservations/public-booking-request-form";
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

      <section id="privacy">
        <SectionLabel icon={Shield} label={t("venuePage.book.privacy")} />
        <div className="max-w-xl">
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
