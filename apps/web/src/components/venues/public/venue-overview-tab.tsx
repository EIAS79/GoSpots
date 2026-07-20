"use client";

import {
  ArrowUpRight,
  CalendarOff,
  CalendarRange,
  Mail,
  MapPin,
  Phone,
  Star,
} from "lucide-react";
import Image from "next/image";
import { StarRatingDisplay } from "@/components/venues/public/venue-reviews-section";
import { cn } from "@/lib/cn";
import type {
  PublicScheduleException,
  PublicVenueDetail,
} from "@/lib/shop-settings-client";
import { resolveMediaUrl } from "@/lib/media-url";
import { formatVenueLocation } from "@/lib/venue-display";
import { VenueWeeklyHours } from "./venue-weekly-hours";

function formatExceptionDate(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(new Date(iso + "T12:00:00"));
  } catch {
    return iso;
  }
}

export function VenueOverviewTab({
  venue,
}: {
  venue: PublicVenueDetail;
  slug: string;
}) {
  const exceptions = venue.scheduleExceptions ?? [];
  const gallery = venue.galleryItems.filter((i) => resolveMediaUrl(i.imageUrl));
  const location = formatVenueLocation(venue);
  const hasContact = !!(venue.phone || venue.email || location);
  const showRating = venue.reviewsMode !== "DISABLED";
  const hasReviews =
    showRating &&
    venue.showReviews !== false &&
    (venue.reviewCount ?? 0) > 0 &&
    venue.averageRating != null;

  return (
    <div className="space-y-10">
      {/* 1. Rating + About — trust first, then story */}
      <section className="grid gap-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:gap-5">
        {showRating ? (
          <div className="flex flex-col justify-center rounded-2xl border border-amber-400/20 bg-gradient-to-br from-amber-500/10 via-[var(--color-surface)] to-[var(--color-background)] px-5 py-6">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-700/80 dark:text-amber-200/70">
              Guest rating
            </p>
            {hasReviews ? (
              <>
                <p className="mt-3 text-4xl font-bold tracking-tight text-[var(--color-foreground)] tabular-nums">
                  {venue.averageRating!.toFixed(1)}
                </p>
                <div className="mt-2">
                  <StarRatingDisplay rating={venue.averageRating!} size={18} />
                </div>
                <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                  Average of {venue.reviewCount} review
                  {venue.reviewCount === 1 ? "" : "s"}
                </p>
              </>
            ) : (
              <>
                <div className="mt-4 flex items-center gap-2 text-zinc-500">
                  <Star size={22} className="text-zinc-400 dark:text-zinc-600" />
                  <span className="text-lg font-medium text-zinc-600 dark:text-zinc-400">
                    No reviews yet
                  </span>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  Be among the first to rate this venue on the Reviews tab.
                </p>
              </>
            )}
          </div>
        ) : null}

        <div
          className={cn(
            "rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-6",
            !showRating && "md:col-span-2",
          )}
        >
          <SectionHeading title="About" className="mb-3" />
          {venue.description ? (
            <p className="text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
              {venue.description}
            </p>
          ) : (
            <p className="text-sm text-zinc-500">
              This venue hasn’t added a description yet.
            </p>
          )}
        </div>
      </section>

      {/* 2. Gallery collage */}
      {gallery.length > 0 ? (
        <section>
          <SectionHeading title="Gallery" />
          <GalleryCollage items={gallery} />
        </section>
      ) : null}

      {/* 3. Hours + Contact */}
      <section
        className={cn(
          "grid gap-4",
          hasContact ? "lg:grid-cols-2" : "grid-cols-1",
        )}
      >
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <SectionHeading title="Opening hours" className="mb-3" />
          <VenueWeeklyHours hours={venue.openingHours} />
        </div>

        {hasContact ? <FindUsPanel venue={venue} location={location} /> : null}
      </section>

      {/* 4. Schedule exceptions last — only when relevant */}
      {exceptions.length > 0 ? (
        <section>
          <SectionHeading title="Schedule updates" />
          <ul className="grid gap-2 sm:grid-cols-2">
            {exceptions.map((ex) => (
              <ScheduleExceptionRow key={ex.id} exception={ex} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function FindUsPanel({
  venue,
  location,
}: {
  venue: PublicVenueDetail;
  location: string | null;
}) {
  const street = venue.address?.trim() || null;
  const locality = [venue.city?.trim(), venue.country?.trim()]
    .filter(Boolean)
    .join(", ");
  const mapsQuery = location ?? street ?? locality;
  const mapsHref = mapsQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`
    : null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-surface)] via-[var(--color-surface)] to-[var(--color-background)] p-5 sm:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-24 h-48 w-48 rounded-full bg-amber-500/[0.12] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-16 -left-10 h-36 w-36 rounded-full bg-sky-500/[0.07] blur-3xl"
      />

      <div className="relative">
        <SectionHeading title="Find us" className="mb-1" />
        <p className="mb-5 text-sm text-zinc-500">
          Directions, call, or email — pick what works.
        </p>

        {location || street ? (
          mapsHref ? (
            <a
              href={mapsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="group mb-3 flex items-start gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)]/50 p-4 transition duration-300 hover:border-amber-400/35 hover:bg-amber-500/[0.07]"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-amber-400/25 bg-amber-500/15 text-amber-700 dark:text-amber-300 transition duration-300 group-hover:scale-105 group-hover:border-amber-400/40">
                <MapPin size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Address
                </p>
                {street ? (
                  <p className="mt-1 text-sm font-medium leading-snug text-[var(--color-foreground)]">
                    {street}
                  </p>
                ) : null}
                {locality ? (
                  <p
                    className={cn(
                      "text-sm text-zinc-600 dark:text-zinc-400",
                      street
                        ? "mt-0.5"
                        : "mt-1 font-medium text-[var(--color-foreground)]",
                    )}
                  >
                    {locality}
                  </p>
                ) : !street && location ? (
                  <p className="mt-1 text-sm font-medium leading-snug text-[var(--color-foreground)]">
                    {location}
                  </p>
                ) : null}
                <span className="mt-2.5 inline-flex items-center gap-1 text-xs font-medium text-amber-700 transition group-hover:text-amber-600 dark:text-amber-300/90 dark:group-hover:text-amber-200">
                  Open in Maps
                  <ArrowUpRight
                    size={13}
                    className="transition duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  />
                </span>
              </div>
            </a>
          ) : (
            <div className="mb-3 flex items-start gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)]/50 p-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-amber-400/25 bg-amber-500/15 text-amber-700 dark:text-amber-300">
                <MapPin size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Address
                </p>
                <p className="mt-1 text-sm font-medium text-[var(--color-foreground)]">
                  {location}
                </p>
              </div>
            </div>
          )
        ) : null}

        {(venue.phone || venue.email) && (
          <div className="grid gap-2">
            {venue.phone ? (
              <ContactAction
                href={`tel:${venue.phone}`}
                icon={Phone}
                label="Call"
                value={venue.phone}
              />
            ) : null}
            {venue.email ? (
              <ContactAction
                href={`mailto:${venue.email}`}
                icon={Mail}
                label="Email"
                value={venue.email}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function ContactAction({
  href,
  icon: Icon,
  label,
  value,
}: {
  href: string;
  icon: typeof Phone;
  label: string;
  value: string;
}) {
  return (
    <a
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)]/40 px-3.5 py-3 transition duration-300 hover:border-amber-400/30 hover:bg-amber-500/[0.06]"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-zinc-600 transition duration-300 group-hover:border-amber-400/30 group-hover:text-amber-700 dark:text-zinc-300 dark:group-hover:text-amber-200">
        <Icon size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          {label}
        </span>
        <span className="mt-0.5 block truncate text-sm text-zinc-800 transition group-hover:text-[var(--color-foreground)] dark:text-zinc-200">
          {value}
        </span>
      </span>
      <ArrowUpRight
        size={14}
        className="shrink-0 text-zinc-400 transition duration-300 group-hover:text-amber-600 dark:text-zinc-600 dark:group-hover:text-amber-300/90 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
      />
    </a>
  );
}

function SectionHeading({
  title,
  className,
}: {
  title: string;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "mb-4 text-xs font-semibold uppercase tracking-widest text-zinc-500",
        className,
      )}
    >
      {title}
    </h2>
  );
}

function GalleryCollage({
  items,
}: {
  items: PublicVenueDetail["galleryItems"];
}) {
  const urls = items
    .map((item) => ({
      ...item,
      url: resolveMediaUrl(item.imageUrl),
    }))
    .filter((i): i is typeof i & { url: string } => !!i.url);

  if (urls.length === 0) return null;

  const featured = urls[0];
  const rest = urls.slice(1, 5);
  const more = urls.length - 5;

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:grid-rows-2 md:gap-3">
      <figure
        className={cn(
          "group relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-900",
          rest.length === 0
            ? "col-span-2 aspect-[16/10] md:col-span-4 md:row-span-2 md:aspect-[21/9]"
            : "col-span-2 aspect-[4/3] md:col-span-2 md:row-span-2 md:aspect-auto md:min-h-[20rem]",
        )}
      >
        <Image
          src={featured.url}
          alt={featured.caption ?? "Venue photo"}
          fill
          className="object-cover transition duration-500 group-hover:scale-[1.03]"
          unoptimized
          sizes="(max-width: 768px) 100vw, 50vw"
        />
        {featured.caption ? (
          <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2.5 pt-8 text-xs text-zinc-200">
            <span className="line-clamp-2">{featured.caption}</span>
          </figcaption>
        ) : null}
      </figure>

      {rest.map((item, i) => (
        <figure
          key={item.id}
          className={cn(
            "group relative aspect-square overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 md:aspect-auto",
            i === 0 && rest.length === 1 && "md:col-span-2 md:row-span-2",
            i === 0 && rest.length === 2 && "md:col-span-2",
            i === 1 && rest.length === 2 && "md:col-span-2",
          )}
        >
          <Image
            src={item.url}
            alt={item.caption ?? "Venue photo"}
            fill
            className="object-cover transition duration-500 group-hover:scale-105"
            unoptimized
            sizes="(max-width: 768px) 50vw, 25vw"
          />
          {i === rest.length - 1 && more > 0 ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-semibold text-white">
              +{more} more
            </div>
          ) : null}
        </figure>
      ))}
    </div>
  );
}

function ScheduleExceptionRow({
  exception,
}: {
  exception: PublicScheduleException;
}) {
  const Icon = exception.isClosed ? CalendarOff : CalendarRange;
  return (
    <li className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      <Icon
        size={18}
        className={
          exception.isClosed ? "text-rose-400/80" : "text-amber-400/80"
        }
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--color-foreground)]">
          {formatExceptionDate(exception.date)}
          {exception.label ? (
            <span className="font-normal text-zinc-600 dark:text-zinc-400">
              {" "}
              · {exception.label}
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {exception.isClosed
            ? "Closed"
            : exception.opensAt && exception.closesAt
              ? `Special hours: ${exception.opensAt} – ${exception.closesAt}`
              : "Special hours"}
        </p>
      </div>
    </li>
  );
}
