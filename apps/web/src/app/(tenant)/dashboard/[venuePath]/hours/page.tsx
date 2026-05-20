"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HoursPanel, weeklyToDraft } from "@/components/hours/hours-panel";
import { FeatureGate } from "@/components/subscription/feature-gate";
import { TenantPage } from "@/components/layout/tenant-page";
import { hasPermission } from "@/lib/auth-client";
import { DASHBOARD_SECTION_GUIDES } from "@/lib/dashboard-section-guides";
import {
  createScheduleException,
  deleteScheduleException,
  fetchSchedule,
  saveWeeklyHours,
  type VenueSchedule,
} from "@/lib/hours-client";
import {
  isFeatureUnlocked,
  resolveEffectiveTier,
  type SubscriptionTier,
} from "@/lib/plan";
import { useAuth } from "@/lib/use-auth";

const GUIDE = DASHBOARD_SECTION_GUIDES.hours;

export default function HoursPage() {
  const { state } = useAuth();
  const [schedule, setSchedule] = useState<VenueSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const membership =
    state.status === "authed" ? state.user.memberships[0] : null;
  const perms = membership?.permissions ?? "";
  const canWrite =
    state.status === "authed" &&
    (membership?.role === "OWNER" ||
      membership?.role === "MANAGER" ||
      hasPermission(perms, "hours.write"));

  const tier = resolveEffectiveTier(
    membership?.shop.subscription
      ? {
          tier: membership.shop.subscription.tier as SubscriptionTier,
          status: membership.shop.subscription.status as
            | "TRIAL"
            | "ACTIVE"
            | "PAST_DUE"
            | "CANCELED",
          trialEndsAt: membership.shop.subscription.trialEndsAt,
        }
      : null,
  );
  const hoursUnlocked = isFeatureUnlocked(tier, "hours");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSchedule(await fetchSchedule());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load hours.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const weeklyDraft = useMemo(
    () => (schedule ? weeklyToDraft(schedule.weekly) : []),
    [schedule],
  );

  return (
    <TenantPage
      title={GUIDE.title}
      description={GUIDE.description}
      capabilities={GUIDE.capabilities}
    >
      <FeatureGate feature="hours" unlocked={hoursUnlocked}>
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
          </div>
        ) : error ? (
          <p className="text-sm text-rose-300">{error}</p>
        ) : schedule ? (
          <>
            {!canWrite ? (
              <p className="mb-4 text-xs text-zinc-500">
                View-only — ask your admin for hours edit access.
              </p>
            ) : null}
            <HoursPanel
              weekly={weeklyDraft}
              exceptions={schedule.exceptions}
              canWrite={canWrite && hoursUnlocked}
              saving={saving}
              onSaveWeekly={async (days) => {
                setSaving(true);
                try {
                  const next = await saveWeeklyHours(
                    days.map((d) => ({
                      weekday: d.weekday,
                      isClosed: d.isClosed,
                      opensAt: d.isClosed ? undefined : d.opensAt,
                      closesAt: d.isClosed ? undefined : d.closesAt,
                    })),
                  );
                  setSchedule(next);
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Could not save hours.",
                  );
                } finally {
                  setSaving(false);
                }
              }}
              onAddException={async (body) => {
                const created = await createScheduleException(body);
                setSchedule((s) =>
                  s
                    ? {
                        ...s,
                        exceptions: [...s.exceptions, created].sort((a, b) =>
                          a.date.localeCompare(b.date),
                        ),
                      }
                    : s,
                );
              }}
              onDeleteException={async (id) => {
                await deleteScheduleException(id);
                setSchedule((s) =>
                  s
                    ? {
                        ...s,
                        exceptions: s.exceptions.filter((e) => e.id !== id),
                      }
                    : s,
                );
              }}
            />
          </>
        ) : null}
      </FeatureGate>
    </TenantPage>
  );
}
