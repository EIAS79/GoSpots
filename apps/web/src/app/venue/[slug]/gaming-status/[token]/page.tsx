"use client";

import {
  CheckCircle2,
  Clock,
  Gamepad2,
  Loader2,
  LogIn,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { GoSpotsLogo } from "@/components/brand/gospots-logo";
import { cn } from "@/lib/cn";
import { parseBowlingNotesSummary } from "@/lib/bowling-booking";
import { bookingCollectsPartySize } from "@/lib/booking-unit-kind";
import {
  GUEST_GAMING_PHASE_LABELS,
  resolveGuestGamingPhase,
  type GuestGamingPhase,
} from "@/lib/guest-gaming-booking-status";
import {
  fetchPublicGamingReservationStatus,
  cancelPublicGamingReservation,
  type PublicGamingReservationStatus,
} from "@/lib/public-gaming-client";
import { useLiveData } from "@/lib/use-live-data";

function formatWhen(startsAt: string) {
  const start = new Date(startsAt);
  const date = start.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const startTime = start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} · ${startTime}`;
}

const PHASE_STYLES: Record<
  GuestGamingPhase,
  {
    icon: typeof Clock;
    ring: string;
    badge: string;
  }
> = {
  upcoming: {
    icon: Clock,
    ring: "border-sky-400/30 bg-sky-500/10 text-sky-100",
    badge: "bg-sky-500/20 text-sky-200",
  },
  waiting: {
    icon: LogIn,
    ring: "border-amber-400/30 bg-amber-500/10 text-amber-100",
    badge: "bg-amber-500/20 text-amber-200",
  },
  in_use: {
    icon: Gamepad2,
    ring: "border-rose-400/30 bg-rose-500/10 text-rose-100",
    badge: "bg-rose-500/20 text-rose-200",
  },
  completed: {
    icon: CheckCircle2,
    ring: "border-zinc-400/30 bg-zinc-500/10 text-zinc-200",
    badge: "bg-zinc-500/20 text-zinc-300",
  },
  no_show: {
    icon: XCircle,
    ring: "border-zinc-500/30 bg-zinc-800/60 text-zinc-400",
    badge: "bg-zinc-700/40 text-zinc-400",
  },
  canceled: {
    icon: XCircle,
    ring: "border-rose-400/30 bg-rose-500/10 text-rose-100",
    badge: "bg-rose-500/20 text-rose-200",
  },
};

export default function GamingReservationStatusPage() {
  const params = useParams();
  const slug = params.slug as string;
  const token = params.token as string;
  const [data, setData] = useState<PublicGamingReservationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const loadStatus = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      try {
        const row = await fetchPublicGamingReservationStatus(slug, token);
        setData(row);
        setError(null);
        if (opts.silent) setNowMs(Date.now());
      } catch (e) {
        if (!opts.silent) {
          setData(null);
          setError(
            e instanceof Error ? e.message : "Could not load booking.",
          );
        }
      } finally {
        if (!opts.silent) setLoading(false);
      }
    },
    [slug, token],
  );

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useLiveData(() => loadStatus({ silent: true }), [loadStatus], {
    enabled: Boolean(slug && token),
    intervalMs: 15_000,
  });

  const phase =
    data != null
      ? resolveGuestGamingPhase(
          data.status,
          data.startsAt,
          data.endsAt,
          nowMs,
        )
      : "upcoming";
  const style = PHASE_STYLES[phase];
  const Icon = style.icon;
  const bowlingSummary =
    data?.categoryType === "BOWLING"
      ? parseBowlingNotesSummary(data.notes)
      : null;
  const showPartySize =
    data != null &&
    (data.categoryType !== "BOWLING" ||
      bookingCollectsPartySize("BOWLING", { notes: data.notes }));

  async function handleCancel() {
    if (
      !data?.canCancel ||
      !confirm(
        "Cancel this booking? You can book again anytime before the session starts.",
      )
    ) {
      return;
    }
    setCancelBusy(true);
    setCancelError(null);
    try {
      await cancelPublicGamingReservation(slug, token);
      await loadStatus({ silent: true });
    } catch (e) {
      setCancelError(
        e instanceof Error ? e.message : "Could not cancel booking.",
      );
    } finally {
      setCancelBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-white/10 px-4 py-4">
        <GoSpotsLogo href="/" size="sm" showTagline />
      </header>

      <main className="mx-auto max-w-lg px-4 py-12">
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-16 text-zinc-500">
            <Loader2 className="animate-spin" size={28} />
            <p className="text-sm">Loading your booking…</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-8 text-center">
            <p className="text-sm text-rose-200">{error}</p>
            <Link
              href={`/venue/${slug}`}
              className="mt-4 inline-block text-sm text-amber-300 underline"
            >
              Back to venue
            </Link>
          </div>
        ) : data ? (
          <div className="space-y-6">
            <div
              className={cn(
                "rounded-2xl border p-8 text-center",
                style.ring,
              )}
            >
              <Icon className="mx-auto" size={40} />
              <p
                className={cn(
                  "mt-4 inline-block rounded-full px-3 py-1 text-xs font-semibold",
                  style.badge,
                )}
              >
                {GUEST_GAMING_PHASE_LABELS[phase]}
              </p>
              <h1 className="mt-4 text-xl font-bold text-white">
                {data.unitName ?? "Gaming station"}
              </h1>
              {data.categoryName ? (
                <p className="mt-1 text-sm text-zinc-400">{data.categoryName}</p>
              ) : null}
              <p className="mt-4 text-sm text-zinc-300">
                {formatWhen(data.startsAt)}
              </p>
              {bowlingSummary ? (
                <p className="mt-2 text-xs capitalize text-amber-200/90">
                  {bowlingSummary}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-zinc-500">
                {data.guestName}
                {showPartySize
                  ? ` · ${data.partySize} player${data.partySize === 1 ? "" : "s"}`
                  : ""}
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-4 text-sm text-zinc-400">
              <p className="font-medium text-zinc-200">{data.venueName}</p>
              <p className="mt-1 text-xs">
                {phase === "canceled" || phase === "no_show"
                  ? "This booking was canceled or marked as no-show."
                  : phase === "waiting"
                    ? "Your start time has passed — check in with staff when you arrive."
                    : "No fixed end time — stay as long as you like once checked in. This page updates automatically."}
              </p>
            </div>

            {data.canCancel ? (
              <div className="space-y-2">
                {cancelError ? (
                  <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                    {cancelError}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleCancel()}
                  disabled={cancelBusy}
                  className="w-full rounded-xl border border-rose-400/30 bg-rose-500/10 py-3 text-sm font-medium text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
                >
                  {cancelBusy ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin" />
                      Canceling…
                    </span>
                  ) : (
                    "Cancel booking"
                  )}
                </button>
                <p className="text-center text-[11px] text-zinc-600">
                  You can cancel before you are checked in at the venue.
                </p>
              </div>
            ) : null}

            <Link
              href={`/venue/${slug}`}
              className="block text-center text-sm text-amber-300 underline"
            >
              Return to {data.venueName}
            </Link>
          </div>
        ) : null}
      </main>
    </div>
  );
}
