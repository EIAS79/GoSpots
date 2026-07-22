"use client";

import {
  Eye,
  EyeOff,
  Loader2,
  Star,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { TenantPage } from "@/components/layout/tenant-page";
import { FeatureGate } from "@/components/subscription/feature-gate";
import { cn } from "@/lib/cn";
import { hasPermission } from "@/lib/auth-client";
import { formatDate } from "@/lib/format";
import { isFeatureUnlocked } from "@/lib/plan";
import {
  deleteStaffReview,
  fetchStaffReviews,
  updateStaffReviewStatus,
  type StaffVenueReview,
  type VenueReviewStatus,
} from "@/lib/reviews-client";
import { useAuth } from "@/lib/use-auth";
import { useCurrentMembership } from "@/lib/use-current-membership";
import { useDashboardGuide } from "@/lib/use-dashboard-guide";
import { useLiveData } from "@/lib/use-live-data";
import { useVenueAccess } from "@/lib/use-venue-access";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";
import { publishLiveEvent } from "@/lib/live-events";

type Filter = "ALL" | VenueReviewStatus;
type ReviewT = (key: string, vars?: Record<string, string | number>) => string;

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`${rating}/5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={12}
          className={cn(
            i < rating
              ? "fill-amber-400 text-amber-400"
              : "text-zinc-600",
          )}
        />
      ))}
    </span>
  );
}

function statusLabel(status: VenueReviewStatus, t: ReviewT) {
  switch (status) {
    case "PUBLISHED":
      return t("reviewsStaff.filterPublished");
    case "REJECTED":
      return t("reviewsStaff.filterHidden");
    default:
      return t("reviewsStaff.filterPending");
  }
}

function statusStyle(status: VenueReviewStatus) {
  switch (status) {
    case "PUBLISHED":
      return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
    case "REJECTED":
      return "border-zinc-500/30 bg-zinc-500/10 text-zinc-400";
    default:
      return "border-amber-400/30 bg-amber-500/10 text-amber-200";
  }
}

export default function ReviewsPage() {
  const guide = useDashboardGuide("reviews");
  const { state } = useAuth();
  const membership = useCurrentMembership();
  const access = useVenueAccess();
  const vs = useVenueSettingsOptional();
  const t: ReviewT = vs?.t ?? ((key) => key);
  const unlocked = isFeatureUnlocked(access.enabledModules, "reviews");

  const perms = membership?.permissions ?? "";
  const isOwner = membership?.role === "OWNER";
  const canRead =
    state.status === "authed" &&
    (isOwner || hasPermission(perms, "reviews.read"));
  const canWrite =
    state.status === "authed" &&
    (isOwner || hasPermission(perms, "reviews.write"));

  const [filter, setFilter] = useState<Filter>("ALL");
  const [reviews, setReviews] = useState<StaffVenueReview[]>([]);
  const [total, setTotal] = useState(0);
  const [averageRating, setAverageRating] = useState<number | null>(null);
  const [publishedCount, setPublishedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!canRead || !unlocked) return;
      if (!opts.silent) setLoading(true);
      setError(null);
      try {
        const data = await fetchStaffReviews({
          status: filter === "ALL" ? undefined : filter,
          take: 100,
        });
        setReviews(data.reviews);
        setTotal(data.total);
        setAverageRating(data.averageRating);
        setPublishedCount(data.publishedCount);
        return true;
      } catch (e) {
        if (!opts.silent) {
          setError(
            e instanceof Error ? e.message : t("reviewsStaff.loadError"),
          );
        }
        return false;
      } finally {
        if (!opts.silent) setLoading(false);
      }
    },
    [canRead, filter, unlocked, t],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useLiveData(() => load({ silent: true }), [filter, unlocked], {
    intervalMs: 20_000,
    refreshOnSections: ["venue"],
  });

  useEffect(() => {
    if (!unlocked) setLoading(false);
  }, [unlocked]);

  async function setStatus(id: string, status: VenueReviewStatus) {
    if (!canWrite) return;
    setBusyId(id);
    try {
      await updateStaffReviewStatus(id, status);
      await load({ silent: true });
      publishLiveEvent({ section: "venue" });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("reviewsStaff.updateError"));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string, name: string) {
    if (!canWrite) return;
    if (!confirm(t("reviewsStaff.deleteConfirm", { name }))) return;
    setBusyId(id);
    try {
      await deleteStaffReview(id);
      await load({ silent: true });
      publishLiveEvent({ section: "venue" });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("reviewsStaff.deleteError"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <TenantPage
      title={guide.title}
      description={guide.description}
      capabilities={guide.capabilities}
    >
      <FeatureGate feature="reviews" unlocked={unlocked}>
        {!canRead ? (
          <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-6 text-sm text-rose-200">
            {t("reviewsStaff.noPermission")}
          </p>
        ) : (
          <>
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <div className="rounded-xl border border-white/10 bg-zinc-900/50 px-4 py-3">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                  {t("reviewsStaff.publicAverage")}
                </p>
                <p className="mt-0.5 flex items-center gap-2 text-lg font-semibold text-white">
                  {averageRating != null ? averageRating.toFixed(1) : "—"}
                  {averageRating != null ? (
                    <Stars rating={Math.round(averageRating)} />
                  ) : null}
                </p>
                <p className="text-[11px] text-zinc-500">
                  {t("reviewsStaff.publishedCount", { count: publishedCount })}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-zinc-900/50 px-4 py-3">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                  {t("reviewsStaff.inThisList")}
                </p>
                <p className="mt-0.5 text-lg font-semibold text-white">{total}</p>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-1 rounded-lg border border-white/10 bg-zinc-950/80 p-1">
              {(
                [
                  { id: "ALL" as const, label: t("reviewsStaff.filterAll") },
                  {
                    id: "PUBLISHED" as const,
                    label: t("reviewsStaff.filterPublished"),
                  },
                  {
                    id: "REJECTED" as const,
                    label: t("reviewsStaff.filterHidden"),
                  },
                  {
                    id: "PENDING" as const,
                    label: t("reviewsStaff.filterPending"),
                  },
                ] as const
              ).map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition",
                    filter === id
                      ? "bg-amber-500/20 text-amber-100"
                      : "text-zinc-500 hover:text-zinc-300",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {error ? (
              <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                {error}
              </p>
            ) : null}

            {loading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="animate-spin text-amber-400" size={28} />
              </div>
            ) : reviews.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 py-16 text-center text-sm text-zinc-500">
                {t("reviewsStaff.emptyState")}
              </p>
            ) : (
              <ul className="space-y-3">
                {reviews.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-xl border border-white/10 bg-zinc-900/50 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-white">{r.guestName}</p>
                          <Stars rating={r.rating} />
                          <span
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                              statusStyle(r.status),
                            )}
                          >
                            {statusLabel(r.status, t)}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-zinc-500">
                          {formatDate(r.createdAt, vs?.locale ?? "en")}
                          {r.guestEmail ? ` · ${r.guestEmail}` : ""}
                        </p>
                      </div>
                      {canWrite ? (
                        <div className="flex flex-wrap gap-1.5">
                          {r.status !== "PUBLISHED" ? (
                            <button
                              type="button"
                              disabled={busyId === r.id}
                              onClick={() => void setStatus(r.id, "PUBLISHED")}
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
                            >
                              <Eye size={12} /> {t("reviewsStaff.publishButton")}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busyId === r.id}
                              onClick={() => void setStatus(r.id, "REJECTED")}
                              className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-zinc-400 hover:bg-white/5 disabled:opacity-50"
                            >
                              <EyeOff size={12} /> {t("reviewsStaff.hideButton")}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => void remove(r.id, r.guestName)}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-400/30 bg-rose-500/10 px-2.5 py-1 text-[11px] text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
                          >
                            <Trash2 size={12} /> {t("reviewsStaff.deleteButton")}
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {r.comment ? (
                      <p className="mt-3 text-sm leading-relaxed text-zinc-300">
                        {r.comment}
                      </p>
                    ) : (
                      <p className="mt-3 text-xs italic text-zinc-600">
                        {t("reviewsStaff.noComment")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </FeatureGate>
    </TenantPage>
  );
}
