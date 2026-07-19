"use client";

import { MapPin, Star } from "lucide-react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { GoSpotsLogo } from "@/components/brand/gospots-logo";
import { VenueCoverImage } from "@/components/ui/venue-cover-image";
import { VenueBookTab } from "@/components/venues/public/venue-book-tab";
import { VenueDiningTab } from "@/components/venues/public/venue-dining-tab";
import { VenueGamingTab } from "@/components/venues/public/venue-gaming-tab";
import { VenueMenuTab } from "@/components/venues/public/venue-menu-tab";
import { VenueOverviewTab } from "@/components/venues/public/venue-overview-tab";
import { VenueReviewsTab } from "@/components/venues/public/venue-reviews-tab";
import { StarRatingDisplay } from "@/components/venues/public/venue-reviews-section";
import { VenueGuestChatWidget } from "@/components/venues/public/venue-guest-chat-widget";
import { VenueTabBar } from "@/components/venues/public/venue-tab-bar";
import { cn } from "@/lib/cn";
import {
  buildVenueTabs,
  type VenueTabId,
} from "@/lib/public-venue-tabs";
import type { PublicVenueDetail } from "@/lib/shop-settings-client";
import { venueOpenStatus } from "@/lib/venue-open-status";
import { formatVenueLocation, venueMarketingName } from "@/lib/venue-display";

export function PublicVenueView({
  venue,
  slug,
}: {
  venue: PublicVenueDetail;
  slug: string;
}) {
  const tabs = useMemo(() => buildVenueTabs(venue), [venue]);
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialTab = searchParams.get("tab");
  const initialCategory = searchParams.get("category") ?? undefined;

  const [activeTab, setActiveTab] = useState<VenueTabId>(() => {
    if (initialTab && tabs.some((t) => t.id === initialTab)) {
      return initialTab as VenueTabId;
    }
    return "overview";
  });

  const syncUrl = useCallback(
    (tab: VenueTabId, categoryId?: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tab === "overview") {
        params.delete("tab");
        params.delete("category");
      } else {
        params.set("tab", tab);
        if (tab === "activities" && categoryId) {
          params.set("category", categoryId);
        } else {
          params.delete("category");
        }
      }
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : `/venue/${slug}`, { scroll: false });
    },
    [router, searchParams, slug],
  );

  const handleTabChange = useCallback(
    (tab: VenueTabId) => {
      setActiveTab(tab);
      syncUrl(tab);
    },
    [syncUrl],
  );

  const handleCategoryChange = useCallback(
    (categoryId: string) => {
      syncUrl("activities", categoryId);
    },
    [syncUrl],
  );

  const title = venueMarketingName(venue);
  const location = formatVenueLocation(venue);
  const status = venueOpenStatus(
    venue.openingHours,
    venue.scheduleExceptions,
  );

  const hasReviews =
    venue.showReviews !== false &&
    (venue.reviewCount ?? 0) > 0 &&
    venue.averageRating != null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-white/10 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4 md:px-6">
          <GoSpotsLogo href="/" size="sm" showTagline className="hidden min-w-0 sm:inline-flex" />
          <GoSpotsLogo href="/" size="sm" className="min-w-0 sm:hidden" />
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Link
              href="/venues"
              className="text-xs text-zinc-500 transition hover:text-zinc-300"
            >
              All venues
            </Link>
            <span className="hidden text-xs text-zinc-600 sm:inline">{venue.currency}</span>
          </div>
        </div>
      </header>

      <div className="relative aspect-[2/1] w-full max-h-[min(40vh,360px)] overflow-hidden border-b border-white/10 sm:aspect-[21/9] sm:max-h-[min(52vh,440px)]">
        <VenueCoverImage
          src={venue.coverImage}
          alt={title}
          sizes="100vw"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/50 to-zinc-950/10" />
        <div className="absolute bottom-0 left-0 right-0">
          <div className="mx-auto max-w-7xl px-4 pb-4 pt-12 sm:px-6 sm:pb-6 sm:pt-16 md:pb-8">
            {venue.tags && venue.tags.length > 0 ? (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {venue.tags.map((t) => (
                  <span
                    key={t.id}
                    className="rounded-full border border-white/20 bg-zinc-950/50 px-2.5 py-0.5 text-[11px] font-medium backdrop-blur-sm"
                    style={{
                      borderColor: t.color ? `${t.color}66` : undefined,
                      color: t.color ?? "#fde68a",
                    }}
                  >
                    {t.name}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4">
              <div className="min-w-0 flex-1">
                <h1 className="break-words text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
                  {title}
                </h1>
                {location ? (
                  <p className="mt-2 flex min-w-0 items-start gap-1.5 text-sm text-zinc-300">
                    <MapPin size={15} className="mt-0.5 shrink-0 opacity-80" />
                    <span className="break-words">{location}</span>
                  </p>
                ) : null}
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                {status.state !== "unknown" ? (
                  <OpenStatusPill status={status} />
                ) : null}
                {hasReviews ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-zinc-950/60 px-2.5 py-1 text-[11px] font-medium text-amber-200 backdrop-blur-sm">
                    <StarRatingDisplay rating={venue.averageRating!} size={11} />
                    {venue.averageRating!.toFixed(1)}
                    <span className="text-zinc-500">
                      ({venue.reviewCount})
                    </span>
                  </span>
                ) : venue.showReviews !== false &&
                  venue.reviewsMode !== "DISABLED" &&
                  venue.reviewsMode !== "HIDDEN" ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-zinc-950/60 px-2.5 py-1 text-[11px] font-medium text-zinc-400 backdrop-blur-sm">
                    <Star size={12} className="text-amber-400/60" />
                    New
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <VenueTabBar
        tabs={tabs}
        active={activeTab}
        onChange={handleTabChange}
        wide={
          activeTab === "menu" ||
          activeTab === "activities" ||
          activeTab === "dining" ||
          activeTab === "reviews"
        }
      />

      <main
        className={cn(
          "mx-auto px-4 sm:px-6 md:px-6",
          activeTab === "menu"
            ? "max-w-7xl py-4 md:py-5"
            : activeTab === "activities" ||
                activeTab === "dining" ||
                activeTab === "reviews"
              ? "max-w-7xl py-8 md:py-10"
              : "max-w-5xl py-8 md:py-10",
        )}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            role="tabpanel"
          >
            {activeTab === "overview" ? (
              <VenueOverviewTab venue={venue} slug={slug} />
            ) : null}
            {activeTab === "menu" ? <VenueMenuTab venue={venue} /> : null}
            {activeTab === "activities" ? (
              <VenueGamingTab
                venue={venue}
                slug={slug}
                initialCategoryId={initialCategory}
                onCategoryChange={handleCategoryChange}
              />
            ) : null}
            {activeTab === "dining" ? (
              <VenueDiningTab venue={venue} slug={slug} />
            ) : null}
            {activeTab === "reviews" ? (
              <VenueReviewsTab venue={venue} slug={slug} />
            ) : null}
            {activeTab === "book" ? (
              <VenueBookTab venue={venue} slug={slug} />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </main>

      {venue.features?.hasGuestChat ? (
        <VenueGuestChatWidget slug={slug} venueName={title} />
      ) : null}
    </div>
  );
}

function OpenStatusPill({
  status,
}: {
  status: ReturnType<typeof venueOpenStatus>;
}) {
  const open = status.state === "open";
  const later = status.state === "opens-later";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold backdrop-blur-sm",
        open && "border-emerald-400/35 bg-emerald-950/70 text-emerald-300",
        later && "border-amber-400/35 bg-amber-950/70 text-amber-300",
        !open && !later && "border-white/10 bg-zinc-950/70 text-zinc-400",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          open && "venue-status-dot bg-emerald-400",
          later && "bg-amber-400",
          !open && !later && "bg-zinc-600",
        )}
      />
      {status.label}
    </span>
  );
}
