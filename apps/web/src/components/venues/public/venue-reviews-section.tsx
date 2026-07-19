"use client";

import { Loader2, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import {
  fetchPublicVenueReviews,
  submitPublicVenueReview,
  type PublicVenueReview,
} from "@/lib/public-guest-client";

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

export function StarRatingDisplay({
  rating,
  size = 14,
  className,
}: {
  rating: number;
  size?: number;
  className?: string;
}) {
  const rounded = Math.round(rating * 10) / 10;
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={size}
          className={cn(
            i < Math.round(rounded)
              ? "fill-amber-400 text-amber-400"
              : "text-zinc-600",
          )}
        />
      ))}
    </span>
  );
}

export function StarRatingInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const [hover, setHover] = useState(0);
  const active = hover || value;
  return (
    <div className="flex gap-1">
      {Array.from({ length: 5 }, (_, i) => {
        const n = i + 1;
        return (
          <button
            key={n}
            type="button"
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange(n)}
            className="rounded p-0.5 transition hover:scale-110"
            aria-label={`Rate ${n} stars`}
          >
            <Star
              size={22}
              className={cn(
                n <= active
                  ? "fill-amber-400 text-amber-400"
                  : "text-zinc-600",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

export function VenueReviewsSection({
  slug,
  initialReviews,
  averageRating,
  reviewCount,
  reviewsMode = "ENABLED",
  canSubmit = true,
  showReviews = true,
  hideList = false,
  onSubmitted,
}: {
  slug: string;
  initialReviews?: PublicVenueReview[];
  averageRating?: number | null;
  reviewCount?: number;
  reviewsMode?: "ENABLED" | "DISABLED" | "HIDDEN";
  canSubmit?: boolean;
  showReviews?: boolean;
  /** When true, only the write form / summary — parent renders the sorted list. */
  hideList?: boolean;
  onSubmitted?: () => void;
}) {
  const [reviews, setReviews] = useState(
    showReviews ? (initialReviews ?? []) : [],
  );
  const [avg, setAvg] = useState(showReviews ? (averageRating ?? null) : null);
  const [count, setCount] = useState(showReviews ? (reviewCount ?? 0) : 0);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [thanks, setThanks] = useState<string | null>(null);

  const allowSubmit = canSubmit && reviewsMode !== "DISABLED";
  const publicList = showReviews && reviewsMode === "ENABLED" && !hideList;

  const summaryLabel = useMemo(() => {
    if (reviewsMode === "DISABLED") return "Reviews are turned off";
    if (reviewsMode === "HIDDEN") return "Reviews are private for this venue";
    if (!showReviews && hideList) {
      return allowSubmit ? "Share your experience" : "Reviews unavailable";
    }
    if (!count || avg == null) return "No reviews yet";
    return `${avg.toFixed(1)} · ${count} review${count === 1 ? "" : "s"}`;
  }, [avg, count, showReviews, reviewsMode, hideList, allowSubmit]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setThanks(null);
    if (!guestName.trim()) {
      setError("Your name is required.");
      return;
    }
    setBusy(true);
    try {
      const res = await submitPublicVenueReview(slug, {
        guestName: guestName.trim(),
        guestEmail: guestEmail.trim() || undefined,
        rating,
        comment: comment.trim() || undefined,
      });
      setThanks(res.message);
      setShowForm(false);
      setGuestName("");
      setGuestEmail("");
      setComment("");
      setRating(5);
      if (publicList) {
        const next = await fetchPublicVenueReviews(slug, { take: 12 });
        setReviews(next.reviews);
        setAvg(next.averageRating);
        setCount(next.reviewCount);
      }
      onSubmitted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit review.");
    } finally {
      setBusy(false);
    }
  }

  if (reviewsMode === "DISABLED") {
    return (
      <p className="rounded-xl border border-white/10 bg-zinc-900/40 px-4 py-5 text-sm text-zinc-500">
        This venue is not accepting reviews.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex min-w-0 items-center gap-3">
          {publicList && avg != null && count > 0 ? (
            <StarRatingDisplay rating={avg} size={18} />
          ) : (
            <Star size={18} className="shrink-0 text-amber-400/50" />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-zinc-200">{summaryLabel}</p>
            <p className="text-xs text-zinc-500">
              {allowSubmit
                ? reviewsMode === "HIDDEN"
                  ? "You can still leave feedback — it won’t appear publicly"
                  : "Share your experience after your visit"
                : "Reviews are closed for guests"}
            </p>
          </div>
        </div>
        {allowSubmit ? (
          <button
            type="button"
            onClick={() => {
              setShowForm((v) => !v);
              setThanks(null);
            }}
            className="w-full rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-200 transition hover:bg-amber-500/20 sm:w-auto"
          >
            {showForm ? "Cancel" : "Write a review"}
          </button>
        ) : null}
      </div>

      {thanks ? (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
          {thanks}
        </p>
      ) : null}

      {showForm && allowSubmit ? (
        <form
          onSubmit={(e) => void submit(e)}
          className="rounded-xl border border-white/10 bg-zinc-900/60 p-5"
        >
          {error ? (
            <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {error}
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs text-zinc-400">
              Your name
              <input
                required
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-400">
              Email (optional)
              <input
                type="email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white"
              />
            </label>
            <div className="sm:col-span-2">
              <p className="text-xs text-zinc-400">Your rating</p>
              <div className="mt-1">
                <StarRatingInput value={rating} onChange={setRating} />
              </div>
            </div>
            <label className="block text-xs text-zinc-400 sm:col-span-2">
              Comment (optional)
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Food, service, atmosphere, gaming setup…"
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : null}
            Post review
          </button>
        </form>
      ) : null}

      {publicList && reviews.length > 0 ? (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-white/10 bg-zinc-900/40 px-4 py-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-zinc-200">{r.guestName}</p>
                <span className="text-[11px] text-zinc-500">
                  {formatReviewDate(r.createdAt)}
                </span>
              </div>
              <div className="mt-1">
                <StarRatingDisplay rating={r.rating} size={12} />
              </div>
              {r.comment ? (
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  {r.comment}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : publicList ? (
        <p className="text-sm text-zinc-500">Be the first to review this venue.</p>
      ) : null}
    </div>
  );
}
