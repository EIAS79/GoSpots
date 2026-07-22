"use client";

import { ArrowDownAZ, ArrowUpAZ, Loader2, Star } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  StarRatingDisplay,
  VenueReviewsSection,
} from "@/components/venues/public/venue-reviews-section";
import { cn } from "@/lib/cn";
import {
  fetchPublicVenueReviews,
  type PublicVenueReview,
} from "@/lib/public-guest-client";
import { usePublicPrefs } from "@/lib/public-prefs-context";
import type { PublicVenueDetail } from "@/lib/shop-settings-client";

type SortKey = "date" | "rating";
type SortOrder = "asc" | "desc";

function formatReviewDate(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function VenueReviewsTab({
  venue,
  slug,
}: {
  venue: PublicVenueDetail;
  slug: string;
}) {
  const { t } = usePublicPrefs();
  const [sort, setSort] = useState<SortKey>("date");
  const [order, setOrder] = useState<SortOrder>("desc");
  const [reviews, setReviews] = useState<PublicVenueReview[]>(
    venue.reviews ?? [],
  );
  const [avg, setAvg] = useState(venue.averageRating ?? null);
  const [count, setCount] = useState(venue.reviewCount ?? 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showReviews = venue.showReviews !== false;
  const canSubmit = venue.canSubmitReview !== false;
  const reviewsMode = venue.reviewsMode ?? "ENABLED";

  const load = useCallback(async () => {
    if (!showReviews || reviewsMode !== "ENABLED") return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPublicVenueReviews(slug, {
        take: 50,
        sort,
        order,
      });
      setReviews(data.reviews);
      setAvg(data.averageRating);
      setCount(data.reviewCount);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("venuePage.reviews.loadError"),
      );
    } finally {
      setLoading(false);
    }
  }, [slug, sort, order, showReviews, reviewsMode, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-[var(--color-surface)] to-[var(--color-background)] p-5 md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-400/90">
              {t("venuePage.reviews.guestReviews")}
            </p>
            <h2 className="mt-1 text-xl font-bold text-[var(--color-foreground)] md:text-2xl">
              {t("venuePage.reviews.whatVisitorsSay")}
            </h2>
            {showReviews && reviewsMode === "ENABLED" && avg != null && count > 0 ? (
              <div className="mt-3 flex items-center gap-3">
                <StarRatingDisplay rating={avg} size={18} />
                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                  <span className="font-semibold text-[var(--color-foreground)]">{avg.toFixed(1)}</span>
                  {" · "}
                  {t(
                    count === 1
                      ? "venuePage.reviews.countOne"
                      : "venuePage.reviews.countMany",
                    { count },
                  )}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-zinc-500">
                {reviewsMode === "DISABLED"
                  ? t("venuePage.reviews.disabledVenue")
                  : reviewsMode === "HIDDEN"
                    ? t("venuePage.reviews.privateHint")
                    : t("venuePage.reviews.beFirst")}
              </p>
            )}
          </div>

          {showReviews && reviewsMode === "ENABLED" ? (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
              <label className="flex w-full items-center justify-between gap-2 text-[11px] text-zinc-500 sm:w-auto sm:justify-start">
                {t("venuePage.reviews.sort")}
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1.5 text-xs text-[var(--color-foreground)] sm:ml-2"
                >
                  <option value="date">{t("venuePage.reviews.sortDate")}</option>
                  <option value="rating">
                    {t("venuePage.reviews.sortRating")}
                  </option>
                </select>
              </label>
              <button
                type="button"
                onClick={() =>
                  setOrder((o) => (o === "desc" ? "asc" : "desc"))
                }
                className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1.5 text-xs text-zinc-700 hover:text-[var(--color-foreground)] dark:text-zinc-300 dark:hover:text-white sm:w-auto"
                title={
                  order === "desc"
                    ? t("venuePage.reviews.orderDescTitle")
                    : t("venuePage.reviews.orderAscTitle")
                }
              >
                {order === "desc" ? (
                  <ArrowDownAZ size={14} />
                ) : (
                  <ArrowUpAZ size={14} />
                )}
                {order === "desc"
                  ? t("venuePage.reviews.orderDesc")
                  : t("venuePage.reviews.orderAsc")}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <VenueReviewsSection
        slug={slug}
        initialReviews={[]}
        averageRating={avg}
        reviewCount={count}
        reviewsMode={reviewsMode}
        canSubmit={canSubmit}
        showReviews={showReviews}
        hideList
        onSubmitted={() => void load()}
      />

      {error ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-amber-400" size={28} />
        </div>
      ) : showReviews && reviewsMode === "ENABLED" ? (
        reviews.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--color-border)] py-12 text-center text-sm text-zinc-500">
            {t("venuePage.reviews.nonePublished")}
          </p>
        ) : (
          <ul className="space-y-3">
            {reviews.map((r) => (
              <li
                key={r.id}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-[var(--color-foreground)]">{r.guestName}</p>
                    <span className="inline-flex items-center gap-0.5">
                      {Array.from({ length: 5 }, (_, i) => (
                        <Star
                          key={i}
                          size={12}
                          className={cn(
                            i < r.rating
                              ? "fill-amber-400 text-amber-400"
                              : "text-zinc-600",
                          )}
                        />
                      ))}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    {formatReviewDate(r.createdAt)}
                  </p>
                </div>
                {r.comment ? (
                  <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                    {r.comment}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
