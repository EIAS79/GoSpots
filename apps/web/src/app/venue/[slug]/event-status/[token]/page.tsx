"use client";

import {
  CheckCircle2,
  Clock,
  Loader2,
  PartyPopper,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { LocoraLogo } from "@/components/brand/locora-logo";
import { cn } from "@/lib/cn";
import {
  cancelPublicEventRequest,
  fetchPublicEventRequestStatus,
  type PublicEventRequestStatus,
} from "@/lib/event-requests-client";
import { resolveGuestTokenApiErrorDisplay } from "@/lib/guest-token-error-display";
import { usePublicPrefs } from "@/lib/public-prefs-context";
import { useLiveData } from "@/lib/use-live-data";

function formatWhen(startsAt: string, endsAt: string | null, locale: string) {
  const start = new Date(startsAt);
  const date = start.toLocaleDateString(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const startTime = start.toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (!endsAt) return `${date} · ${startTime}`;
  const endTime = new Date(endsAt).toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} · ${startTime} – ${endTime}`;
}

const STATUS_STYLES = {
  PENDING: {
    icon: Clock,
    ring: "border-amber-400/30 bg-amber-500/10 text-amber-100",
    badge: "bg-amber-500/20 text-amber-200",
  },
  APPROVED: {
    icon: CheckCircle2,
    ring: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
    badge: "bg-emerald-500/20 text-emerald-200",
  },
  DECLINED: {
    icon: XCircle,
    ring: "border-rose-400/30 bg-rose-500/10 text-rose-100",
    badge: "bg-rose-500/20 text-rose-200",
  },
  CANCELED: {
    icon: XCircle,
    ring: "border-zinc-400/30 bg-zinc-500/10 text-zinc-300",
    badge: "bg-zinc-500/20 text-zinc-300",
  },
} as const;

export default function EventRequestStatusPage() {
  const { t, locale } = usePublicPrefs();
  const params = useParams();
  const slug = params.slug as string;
  const token = params.token as string;
  const [data, setData] = useState<PublicEventRequestStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const loadStatus = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      try {
        const row = await fetchPublicEventRequestStatus(slug, token);
        setData(row);
        setError(null);
        return true;
      } catch (e) {
        if (!opts.silent) {
          setData(null);
          setError(
            resolveGuestTokenApiErrorDisplay(
              e,
              locale,
              t("guestStatus.event.loadError"),
            ),
          );
        }
        return false;
      } finally {
        if (!opts.silent) setLoading(false);
      }
    },
    [slug, token, t, locale],
  );

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useLiveData(() => loadStatus({ silent: true }), [loadStatus], {
    enabled: Boolean(slug && token),
    intervalMs: 15_000,
  });

  async function handleCancel() {
    if (
      !data?.canCancel ||
      !confirm(t("guestStatus.event.cancelConfirm"))
    ) {
      return;
    }
    setCancelBusy(true);
    setCancelError(null);
    try {
      await cancelPublicEventRequest(slug, token);
      await loadStatus({ silent: true });
    } catch (e) {
      setCancelError(
        resolveGuestTokenApiErrorDisplay(
          e,
          locale,
          t("guestStatus.event.cancelError"),
        ),
      );
    } finally {
      setCancelBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-950 text-zinc-500">
        <Loader2 className="size-8 animate-spin text-violet-400" />
        <p className="text-sm">{t("guestStatus.event.loading")}</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 px-4 text-center">
        <p className="text-zinc-400">
          {error ?? t("guestStatus.event.notFound")}
        </p>
        <Link
          href={`/venue/${slug}`}
          className="text-sm text-violet-400 hover:text-violet-300"
        >
          {t("guestStatus.backToVenue")}
        </Link>
      </div>
    );
  }

  const style = STATUS_STYLES[data.status];
  const Icon = style.icon;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-white/10 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-4">
          <LocoraLogo href="/" size="md" />
          <Link
            href={`/venue/${slug}`}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            {data.venueName}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-10">
        <div
          className={cn(
            "rounded-2xl border p-6 text-center",
            style.ring,
          )}
        >
          <Icon className="mx-auto" size={36} />
          <p className="mt-3 text-xs uppercase tracking-wide opacity-80">
            {t("guestStatus.event.eyebrow")}
          </p>
          <h1 className="mt-1 text-xl font-semibold text-white">
            {t(`guestStatus.event.type.${data.eventType}`)}
          </h1>
          <span
            className={cn(
              "mt-3 inline-block rounded-full px-3 py-1 text-xs font-medium",
              style.badge,
            )}
          >
            {t(`guestStatus.event.status.${data.status}`)}
          </span>
        </div>

        <div className="mt-6 space-y-4 rounded-xl border border-white/10 bg-zinc-900/60 p-5">
          <div className="flex items-start gap-3">
            <PartyPopper className="mt-0.5 shrink-0 text-violet-300" size={18} />
            <div>
              <p className="text-sm text-zinc-400">
                {t("guestStatus.event.guest")}
              </p>
              <p className="font-medium text-white">
                {data.guestName}
                {data.partySize > 1
                  ? ` · ${t("guestStatus.event.guestsMany", {
                      count: data.partySize,
                    })}`
                  : ""}
              </p>
            </div>
          </div>
          <div>
            <p className="text-sm text-zinc-400">
              {t("guestStatus.event.preferredTime")}
            </p>
            <p className="mt-0.5 text-white">
              {formatWhen(
                data.preferredStartsAt,
                data.preferredEndsAt,
                locale,
              )}
            </p>
          </div>
          {data.resourceCategory ? (
            <div>
              <p className="text-sm text-zinc-400">
                {data.resourceCategory.type === "DINING"
                  ? t("guestStatus.event.diningArea")
                  : t("guestStatus.event.activity")}
              </p>
              <p className="mt-0.5 text-white">{data.resourceCategory.name}</p>
            </div>
          ) : null}
          {data.message ? (
            <div>
              <p className="text-sm text-zinc-400">
                {t("guestStatus.event.yourNote")}
              </p>
              <p className="mt-0.5 text-sm text-zinc-300">{data.message}</p>
            </div>
          ) : null}
          {data.staffResponseNote ? (
            <div className="rounded-lg border border-white/10 bg-zinc-950/60 px-4 py-3">
              <p className="text-xs text-zinc-500">
                {t("guestStatus.event.venueMessage")}
              </p>
              <p className="mt-1 text-sm text-zinc-200">{data.staffResponseNote}</p>
            </div>
          ) : null}
          {data.status === "PENDING" ? (
            <p className="text-xs text-zinc-500">
              {t("guestStatus.event.hintPending")}
            </p>
          ) : null}
          {data.status === "APPROVED" &&
          data.resourceCategory?.type === "DINING" ? (
            <p className="text-xs text-zinc-500">
              {t("guestStatus.event.hintApprovedDining")}
            </p>
          ) : null}
        </div>

        {data.canCancel ? (
          <div className="mt-6 space-y-2">
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
                  {t("guestStatus.canceling")}
                </span>
              ) : (
                t("guestStatus.event.cancel")
              )}
            </button>
            <p className="text-center text-[11px] text-zinc-600">
              {t("guestStatus.event.cancelHint")}
            </p>
          </div>
        ) : null}

        <p className="mt-8 text-center text-xs text-zinc-600">
          {t("guestStatus.event.questionsBefore", { name: data.venueName })}{" "}
          <Link
            href={`/venue/${slug}`}
            className="text-violet-400 hover:underline"
          >
            {t("guestStatus.event.venuePage")}
          </Link>
          {t("guestStatus.event.questionsAfter")}
        </p>
      </main>
    </div>
  );
}
