"use client";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { HoursPanel, weeklyToDraft } from "@/components/hours/hours-panel";
import { applyOnboardingTemplate } from "@/lib/apply-onboarding-template";
import { createPlaySession } from "@/lib/finance-client";
import {
  createScheduleException,
  deleteScheduleException,
  fetchSchedule,
  saveWeeklyHours,
  updateScheduleException,
  type VenueSchedule,
} from "@/lib/hours-client";
import { listIanaTimeZones, isValidIanaTimeZone } from "@/lib/iana-timezone";
import { SUPPORTED_CURRENCIES } from "@/lib/locale-currency";
import { coerceMoney } from "@/lib/money";
import {
  countedDoneSteps,
  ensureOnboardingProgress,
  finishOnboarding,
  markStepComplete,
  markStepSkipped,
  ONBOARDING_STEP_COUNT,
  type OnboardingProgress,
  writeOnboardingProgress,
} from "@/lib/onboarding-progress";
import {
  ONBOARDING_TEMPLATES,
  type OnboardingTemplateId,
} from "@/lib/onboarding-templates";
import { isFeatureUnlocked } from "@/lib/plan";
import {
  fetchResourceCatalog,
  updateResourceCategory,
  updateResourceUnit,
  type ResourceCatalog,
} from "@/lib/resources-client";
import {
  fetchShopSettings,
  previewCurrencyChange,
  syncVenueCategories,
  updateShopSettings,
  type ShopSettingsResponse,
  type VenueCategoryPreset,
} from "@/lib/shop-settings-client";
import { createStaff } from "@/lib/staff-client";
import { useCurrentMembership } from "@/lib/use-current-membership";
import { useVenueAccess } from "@/lib/use-venue-access";
import { useVenueHref } from "@/lib/venue-context";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";
import { cn } from "@/lib/cn";

const STEP_TITLE_KEYS = [
  "onboarding.step.details",
  "onboarding.step.regional",
  "onboarding.step.hours",
  "onboarding.step.template",
  "onboarding.step.categories",
  "onboarding.step.resources",
  "onboarding.step.pricing",
  "onboarding.step.testSession",
  "onboarding.step.staff",
  "onboarding.step.preview",
] as const;

export function OnboardingWizard({ venuePath }: { venuePath: string }) {
  const t = useVenueSettingsOptional()?.t;
  const membership = useCurrentMembership();
  const access = useVenueAccess();
  const overviewHref = useVenueHref("");
  const sessionsHref = useVenueHref("/sessions");
  const subscriptionHref = useVenueHref("/subscription");
  const shopId = membership?.shop.id ?? null;

  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [settings, setSettings] = useState<ShopSettingsResponse | null>(null);
  const [catalog, setCatalog] = useState<ResourceCatalog | null>(null);
  const [schedule, setSchedule] = useState<VenueSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const tr = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      t?.(key as never, vars) ?? key,
    [t],
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = ensureOnboardingProgress(venuePath, shopId);
      setProgress(p);
      const [s, c, h] = await Promise.all([
        fetchShopSettings(),
        fetchResourceCatalog().catch(() => null),
        fetchSchedule().catch(() => null),
      ]);
      setSettings(s);
      setCatalog(c);
      setSchedule(h);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : tr("onboarding.loadError"),
      );
    } finally {
      setLoading(false);
    }
  }, [venuePath, shopId, tr]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const step = progress?.currentStep ?? 0;
  const doneCount = progress ? countedDoneSteps(progress) : 0;
  const marketingUnlocked = isFeatureUnlocked(
    access.enabledModules,
    "marketing",
  );

  function goStep(next: number) {
    if (!progress) return;
    const patched = {
      ...progress,
      currentStep: Math.max(0, Math.min(next, ONBOARDING_STEP_COUNT - 1)),
    };
    writeOnboardingProgress(patched);
    setProgress(patched);
    setError(null);
    setMessage(null);
  }

  function completeCurrent() {
    if (!progress) return;
    setProgress(markStepComplete(progress, step));
    setMessage(null);
    setError(null);
  }

  function skipCurrent() {
    if (!progress) return;
    if (step === 0) {
      setError(tr("onboarding.detailsRequired"));
      return;
    }
    setProgress(markStepSkipped(progress, step));
    setMessage(null);
    setError(null);
  }

  function onFinish() {
    if (!progress) return;
    setProgress(finishOnboarding(progress));
  }

  if (loading || !progress) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (progress.completedAt) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-16 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-emerald-500/15 text-emerald-300">
          <Check size={28} />
        </div>
        <h1 className="text-2xl font-semibold text-white">
          {tr("onboarding.finishedTitle")}
        </h1>
        <p className="text-sm text-zinc-400">{tr("onboarding.finishedBody")}</p>
        <Link
          href={overviewHref}
          className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950"
        >
          {tr("onboarding.goDashboard")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-white/10 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400/90">
                {tr("onboarding.eyebrow")}
              </p>
              <h1 className="text-xl font-semibold text-white sm:text-2xl">
                {tr(STEP_TITLE_KEYS[step])}
              </h1>
            </div>
            <p className="text-sm text-zinc-400">
              {tr("onboarding.progress", {
                done: doneCount,
                total: ONBOARDING_STEP_COUNT,
              })}
            </p>
          </div>
          <div className="flex gap-1">
            {Array.from({ length: ONBOARDING_STEP_COUNT }, (_, i) => {
              const done =
                progress.completedSteps.includes(i) ||
                progress.skippedSteps.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  title={tr(STEP_TITLE_KEYS[i])}
                  onClick={() => goStep(i)}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition",
                    i === step
                      ? "bg-emerald-400"
                      : done
                        ? "bg-emerald-500/40"
                        : "bg-white/10",
                  )}
                />
              );
            })}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {error ? (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
              {message}
            </p>
          ) : null}

          {step === 0 && settings ? (
            <DetailsStep
              settings={settings}
              busy={busy}
              tr={tr}
              onSave={async (body) => {
                setBusy(true);
                setError(null);
                try {
                  const next = await updateShopSettings(body);
                  setSettings(next);
                  completeCurrent();
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : tr("onboarding.saveError"),
                  );
                } finally {
                  setBusy(false);
                }
              }}
            />
          ) : null}

          {step === 1 && settings ? (
            <RegionalStep
              settings={settings}
              busy={busy}
              tr={tr}
              onSave={async (body) => {
                setBusy(true);
                setError(null);
                try {
                  const next = await updateShopSettings(body);
                  setSettings(next);
                  completeCurrent();
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : tr("onboarding.saveError"),
                  );
                } finally {
                  setBusy(false);
                }
              }}
            />
          ) : null}

          {step === 2 && schedule ? (
            <HoursStep
              schedule={schedule}
              setSchedule={setSchedule}
              busy={busy}
              setBusy={setBusy}
              setError={setError}
              tr={tr}
              onContinue={completeCurrent}
            />
          ) : null}

          {step === 3 ? (
            <TemplateStep
              progress={progress}
              setProgress={setProgress}
              busy={busy}
              setBusy={setBusy}
              setError={setError}
              setMessage={setMessage}
              setCatalog={setCatalog}
              setSettings={setSettings}
              tr={tr}
              onContinue={completeCurrent}
            />
          ) : null}

          {step === 4 && settings ? (
            <CategoriesStep
              settings={settings}
              setSettings={setSettings}
              busy={busy}
              setBusy={setBusy}
              setError={setError}
              tr={tr}
              onContinue={completeCurrent}
            />
          ) : null}

          {step === 5 ? (
            <ResourcesStep
              catalog={catalog}
              setCatalog={setCatalog}
              busy={busy}
              setBusy={setBusy}
              setError={setError}
              tr={tr}
              onContinue={completeCurrent}
              onReload={loadAll}
            />
          ) : null}

          {step === 6 ? (
            <PricingStep
              catalog={catalog}
              setCatalog={setCatalog}
              busy={busy}
              setBusy={setBusy}
              setError={setError}
              tr={tr}
              onContinue={completeCurrent}
            />
          ) : null}

          {step === 7 ? (
            <TestSessionStep
              catalog={catalog}
              busy={busy}
              setBusy={setBusy}
              setError={setError}
              setMessage={setMessage}
              sessionsHref={sessionsHref}
              tr={tr}
              onContinue={completeCurrent}
            />
          ) : null}

          {step === 8 ? (
            <StaffStep
              busy={busy}
              setBusy={setBusy}
              setError={setError}
              setMessage={setMessage}
              tr={tr}
              onContinue={completeCurrent}
            />
          ) : null}

          {step === 9 && settings ? (
            <PreviewStep
              settings={settings}
              setSettings={setSettings}
              catalog={catalog}
              schedule={schedule}
              marketingUnlocked={marketingUnlocked}
              subscriptionHref={subscriptionHref}
              busy={busy}
              setBusy={setBusy}
              setError={setError}
              tr={tr}
              onFinish={onFinish}
            />
          ) : null}
        </div>
      </div>

      <footer className="shrink-0 border-t border-white/10 px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            disabled={step === 0 || busy}
            onClick={() => goStep(step - 1)}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300 disabled:opacity-40"
          >
            <ChevronLeft size={16} />
            {tr("onboarding.back")}
          </button>
          <div className="flex flex-wrap gap-2">
            {step > 0 && step < 9 ? (
              <button
                type="button"
                disabled={busy}
                onClick={skipCurrent}
                className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200"
              >
                {tr("onboarding.skip")}
              </button>
            ) : null}
            {step < 9 ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => goStep(step + 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100"
              >
                {tr("onboarding.next")}
                <ChevronRight size={16} />
              </button>
            ) : null}
            <Link
              href={overviewHref}
              className="rounded-lg px-3 py-2 text-sm text-zinc-500 hover:text-zinc-300"
            >
              {tr("onboarding.exit")}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function DetailsStep({
  settings,
  busy,
  tr,
  onSave,
}: {
  settings: ShopSettingsResponse;
  busy: boolean;
  tr: (k: string, v?: Record<string, string | number>) => string;
  onSave: (body: {
    name: string;
    displayName: string | null;
    description: string | null;
    city: string | null;
    country: string | null;
    phone: string | null;
  }) => Promise<void>;
}) {
  const shop = settings.shop;
  const [name, setName] = useState(shop.name);
  const [displayName, setDisplayName] = useState(shop.displayName ?? "");
  const [description, setDescription] = useState(shop.description ?? "");
  const [city, setCity] = useState(shop.city ?? "");
  const [country, setCountry] = useState(shop.country ?? "");
  const [phone, setPhone] = useState(shop.phone ?? "");

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        void onSave({
          name: name.trim(),
          displayName: displayName.trim() || null,
          description: description.trim() || null,
          city: city.trim() || null,
          country: country.trim() || null,
          phone: phone.trim() || null,
        });
      }}
    >
      <p className="text-sm text-zinc-400">{tr("onboarding.detailsHint")}</p>
      <Field label={tr("onboarding.field.name")} required>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none"
        />
      </Field>
      <Field label={tr("onboarding.field.tagline")}>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none"
          placeholder={tr("onboarding.field.taglinePlaceholder")}
        />
      </Field>
      <Field label={tr("onboarding.field.description")}>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none"
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={tr("onboarding.field.city")}>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none"
          />
        </Field>
        <Field label={tr("onboarding.field.country")}>
          <input
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none"
          />
        </Field>
      </div>
      <Field label={tr("common.phone")}>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none"
        />
      </Field>
      <p className="text-xs text-zinc-500">
        {tr("onboarding.field.slugLocked", { slug: shop.slug })}
      </p>
      <PrimaryButton busy={busy} label={tr("onboarding.saveContinue")} />
    </form>
  );
}

function RegionalStep({
  settings,
  busy,
  tr,
  onSave,
}: {
  settings: ShopSettingsResponse;
  busy: boolean;
  tr: (k: string, v?: Record<string, string | number>) => string;
  onSave: (body: {
    timezone: string;
    currency?: string;
    confirm?: boolean;
  }) => Promise<void>;
}) {
  const shop = settings.shop;
  const timezones = useMemo(() => listIanaTimeZones(), []);
  const [timezone, setTimezone] = useState(shop.timezone);
  const [currency, setCurrency] = useState(shop.currency);
  const [confirmFx, setConfirmFx] = useState(false);
  const [previewNote, setPreviewNote] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!isValidIanaTimeZone(timezone)) return;
    if (currency !== shop.currency && !confirmFx) {
      setPreviewing(true);
      try {
        const preview = await previewCurrencyChange(currency);
        setPreviewNote(
          tr("onboarding.currencyPreview", {
            from: preview.from,
            to: preview.to,
            rate: preview.rate.toFixed(4),
            n: preview.summary.resources + preview.summary.resourceRates,
          }),
        );
        setConfirmFx(true);
      } catch (err) {
        setPreviewNote(
          err instanceof Error ? err.message : tr("onboarding.saveError"),
        );
      } finally {
        setPreviewing(false);
      }
      return;
    }
    const body: {
      timezone: string;
      currency?: string;
      confirm?: boolean;
    } = { timezone };
    if (currency !== shop.currency) {
      body.currency = currency;
      body.confirm = true;
    }
    await onSave(body);
  }

  return (
    <form className="space-y-4" onSubmit={(e) => void submit(e)}>
      <p className="text-sm text-zinc-400">{tr("onboarding.regionalHint")}</p>
      <Field label={tr("settings.timezone")}>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none"
        >
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </Field>
      <Field label={tr("settings.currency")}>
        <select
          value={currency}
          onChange={(e) => {
            setCurrency(e.target.value);
            setConfirmFx(false);
            setPreviewNote(null);
          }}
          className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none"
        >
          {SUPPORTED_CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      {previewNote ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          {previewNote}
        </p>
      ) : null}
      <PrimaryButton
        busy={busy || previewing}
        label={
          currency !== shop.currency && !confirmFx
            ? tr("onboarding.previewCurrency")
            : tr("onboarding.saveContinue")
        }
      />
    </form>
  );
}

function HoursStep({
  schedule,
  setSchedule,
  busy,
  setBusy,
  setError,
  tr,
  onContinue,
}: {
  schedule: VenueSchedule;
  setSchedule: (s: VenueSchedule) => void;
  busy: boolean;
  setBusy: (b: boolean) => void;
  setError: (e: string | null) => void;
  tr: (k: string) => string;
  onContinue: () => void;
}) {
  const weeklyDraft = useMemo(
    () => weeklyToDraft(schedule.weekly),
    [schedule.weekly],
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">{tr("onboarding.hoursHint")}</p>
      <HoursPanel
        weekly={weeklyDraft}
        exceptions={schedule.exceptions}
        canWrite={!busy}
        saving={busy}
        onSaveWeekly={async (days) => {
          setBusy(true);
          setError(null);
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
              e instanceof Error ? e.message : tr("onboarding.saveError"),
            );
          } finally {
            setBusy(false);
          }
        }}
        onAddException={async (body) => {
          const created = await createScheduleException(body);
          setSchedule({
            ...schedule,
            exceptions: [...schedule.exceptions, created].sort((a, b) =>
              a.date.localeCompare(b.date),
            ),
          });
        }}
        onDeleteException={async (id) => {
          await deleteScheduleException(id);
          setSchedule({
            ...schedule,
            exceptions: schedule.exceptions.filter((e) => e.id !== id),
          });
        }}
        onUpdateException={async (id, body) => {
          const updated = await updateScheduleException(id, body);
          setSchedule({
            ...schedule,
            exceptions: schedule.exceptions
              .map((e) => (e.id === id ? updated : e))
              .sort((a, b) => a.date.localeCompare(b.date)),
          });
        }}
      />
      <button
        type="button"
        onClick={onContinue}
        className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950"
      >
        {tr("onboarding.hoursContinue")}
      </button>
    </div>
  );
}

function TemplateStep({
  progress,
  setProgress,
  busy,
  setBusy,
  setError,
  setMessage,
  setCatalog,
  setSettings,
  tr,
  onContinue,
}: {
  progress: OnboardingProgress;
  setProgress: (p: OnboardingProgress) => void;
  busy: boolean;
  setBusy: (b: boolean) => void;
  setError: (e: string | null) => void;
  setMessage: (m: string | null) => void;
  setCatalog: (c: ResourceCatalog | null) => void;
  setSettings: (s: ShopSettingsResponse) => void;
  tr: (k: string, v?: Record<string, string | number>) => string;
  onContinue: () => void;
}) {
  const [selected, setSelected] = useState<OnboardingTemplateId | null>(
    (progress.templateId as OnboardingTemplateId | null) ?? null,
  );

  async function apply(replace: boolean) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await applyOnboardingTemplate({
        templateId: selected,
        previousCategoryIds: progress.templateCategoryIds,
        replace:
          replace ||
          (progress.templateCategoryIds.length > 0 &&
            progress.templateId !== selected),
      });
      const next: OnboardingProgress = {
        ...progress,
        templateId: result.templateId,
        templateCategoryIds: result.categoryIds,
      };
      writeOnboardingProgress(next);
      setProgress(next);
      const [c, s] = await Promise.all([
        fetchResourceCatalog(),
        fetchShopSettings(),
      ]);
      setCatalog(c);
      setSettings(s);
      setMessage(tr("onboarding.templateApplied"));
      onContinue();
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("onboarding.saveError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">{tr("onboarding.templateHint")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {ONBOARDING_TEMPLATES.map((tpl) => {
          const on = selected === tpl.id;
          return (
            <button
              key={tpl.id}
              type="button"
              onClick={() => setSelected(tpl.id)}
              className={cn(
                "rounded-xl border p-4 text-left transition",
                on
                  ? "border-emerald-400/50 bg-emerald-500/10"
                  : "border-white/10 bg-zinc-900/40 hover:border-white/20",
              )}
            >
              <div className="mb-1 flex items-center gap-2 text-emerald-300">
                <Sparkles size={16} />
                <span className="font-semibold text-white">
                  {tr(`onboarding.template.${tpl.id}.name`)}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                {tr(`onboarding.template.${tpl.id}.blurb`)}
              </p>
              <p className="mt-2 text-[11px] text-zinc-500">
                {tr("onboarding.template.units", {
                  n: tpl.categories.reduce((s, c) => s + c.unitCount, 0),
                })}
              </p>
            </button>
          );
        })}
      </div>
      {progress.templateId && progress.templateCategoryIds.length > 0 ? (
        <p className="text-xs text-amber-200/90">
          {tr("onboarding.templateReplaceHint")}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!selected || busy}
          onClick={() => void apply(false)}
          className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-40"
        >
          {busy ? (
            <Loader2 className="inline h-4 w-4 animate-spin" />
          ) : (
            tr("onboarding.applyTemplate")
          )}
        </button>
        {progress.templateCategoryIds.length > 0 ? (
          <button
            type="button"
            disabled={!selected || busy}
            onClick={() => void apply(true)}
            className="rounded-lg border border-amber-500/40 px-4 py-2.5 text-sm text-amber-100 disabled:opacity-40"
          >
            {tr("onboarding.replaceTemplate")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function CategoriesStep({
  settings,
  setSettings,
  busy,
  setBusy,
  setError,
  tr,
  onContinue,
}: {
  settings: ShopSettingsResponse;
  setSettings: (s: ShopSettingsResponse) => void;
  busy: boolean;
  setBusy: (b: boolean) => void;
  setError: (e: string | null) => void;
  tr: (k: string) => string;
  onContinue: () => void;
}) {
  const presets = settings.venueCategoryPresets ?? [];
  const [selected, setSelected] = useState(
    () => new Set((settings.venueCategories ?? []).map((c) => c.slug)),
  );

  function toggle(slug: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const presetSlugs = [...selected].filter((slug) =>
        presets.some((p: VenueCategoryPreset) => p.slug === slug),
      );
      const data = await syncVenueCategories({ presetSlugs, custom: [] });
      setSettings(data);
      onContinue();
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("onboarding.saveError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">{tr("onboarding.categoriesHint")}</p>
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => {
          const on = selected.has(p.slug);
          return (
            <button
              key={p.slug}
              type="button"
              onClick={() => toggle(p.slug)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                on
                  ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100"
                  : "border-white/10 text-zinc-400 hover:border-white/20",
              )}
            >
              {p.name}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void save()}
        className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-40"
      >
        {tr("onboarding.saveContinue")}
      </button>
    </div>
  );
}

function ResourcesStep({
  catalog,
  setCatalog,
  busy,
  setBusy,
  setError,
  tr,
  onContinue,
  onReload,
}: {
  catalog: ResourceCatalog | null;
  setCatalog: (c: ResourceCatalog | null) => void;
  busy: boolean;
  setBusy: (b: boolean) => void;
  setError: (e: string | null) => void;
  tr: (k: string) => string;
  onContinue: () => void;
  onReload: () => Promise<void>;
}) {
  const units =
    catalog?.categories.flatMap((c) =>
      c.resources.map((r) => ({ ...r, categoryName: c.name })),
    ) ?? [];

  async function rename(id: string, name: string) {
    setBusy(true);
    setError(null);
    try {
      await updateResourceUnit(id, { name });
      await onReload();
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("onboarding.saveError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">{tr("onboarding.resourcesHint")}</p>
      {units.length === 0 ? (
        <p className="text-sm text-amber-200">{tr("onboarding.noResources")}</p>
      ) : (
        <ul className="divide-y divide-white/5 rounded-xl border border-white/10">
          {units.map((u) => (
            <li
              key={u.id}
              className="flex flex-wrap items-center gap-2 px-3 py-2.5"
            >
              <span className="text-[11px] text-zinc-500">{u.categoryName}</span>
              <input
                defaultValue={u.name}
                disabled={busy}
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (next && next !== u.name) void rename(u.id, next);
                }}
                className="min-w-0 flex-1 rounded-md border border-white/10 bg-zinc-950 px-2 py-1.5 text-sm text-white"
              />
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => {
          void fetchResourceCatalog()
            .then(setCatalog)
            .finally(onContinue);
        }}
        className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950"
      >
        {tr("onboarding.saveContinue")}
      </button>
    </div>
  );
}

function PricingStep({
  catalog,
  setCatalog,
  busy,
  setBusy,
  setError,
  tr,
  onContinue,
}: {
  catalog: ResourceCatalog | null;
  setCatalog: (c: ResourceCatalog | null) => void;
  busy: boolean;
  setBusy: (b: boolean) => void;
  setError: (e: string | null) => void;
  tr: (k: string) => string;
  onContinue: () => void;
}) {
  const categories = catalog?.categories ?? [];

  async function saveRate(
    categoryId: string,
    rates: { label: string; durationMinutes?: number; price: number }[],
  ) {
    setBusy(true);
    setError(null);
    try {
      await updateResourceCategory(categoryId, { rates });
      setCatalog(await fetchResourceCatalog());
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("onboarding.saveError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">{tr("onboarding.pricingHint")}</p>
      {categories.length === 0 ? (
        <p className="text-sm text-amber-200">{tr("onboarding.noResources")}</p>
      ) : (
        <ul className="space-y-3">
          {categories.map((c) => {
            const rate = c.rates[0];
            const price = rate ? coerceMoney(rate.price) : 0;
            return (
              <li
                key={c.id}
                className="rounded-xl border border-white/10 bg-zinc-900/40 p-3"
              >
                <p className="mb-2 text-sm font-medium text-white">{c.name}</p>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs text-zinc-500">
                    {tr("onboarding.defaultRate")}
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      defaultValue={price}
                      disabled={busy}
                      onBlur={(e) => {
                        const next = Number(e.target.value);
                        if (!Number.isFinite(next) || next === price) return;
                        void saveRate(c.id, [
                          {
                            label: rate?.label ?? "Hourly",
                            durationMinutes: rate?.durationMinutes ?? 60,
                            price: next,
                          },
                        ]);
                      }}
                      className="mt-1 block w-28 rounded-md border border-white/10 bg-zinc-950 px-2 py-1.5 text-sm text-white"
                    />
                  </label>
                  <span className="pb-2 text-xs text-zinc-500">
                    {c.resources.length} units
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        onClick={onContinue}
        className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950"
      >
        {tr("onboarding.saveContinue")}
      </button>
    </div>
  );
}

function TestSessionStep({
  catalog,
  busy,
  setBusy,
  setError,
  setMessage,
  sessionsHref,
  tr,
  onContinue,
}: {
  catalog: ResourceCatalog | null;
  busy: boolean;
  setBusy: (b: boolean) => void;
  setError: (e: string | null) => void;
  setMessage: (m: string | null) => void;
  sessionsHref: string;
  tr: (k: string) => string;
  onContinue: () => void;
}) {
  const units =
    catalog?.categories.flatMap((c) => c.resources).filter(Boolean) ?? [];
  const [resourceId, setResourceId] = useState(units[0]?.id ?? "");

  useEffect(() => {
    if (!resourceId && units[0]?.id) setResourceId(units[0].id);
  }, [units, resourceId]);

  async function startTest() {
    if (!resourceId) {
      setError(tr("onboarding.noResources"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createPlaySession({
        resourceId,
        durationMinutes: 15,
        label: "Onboarding test",
        note: "onboardingTest",
      });
      setMessage(tr("onboarding.testStarted"));
      onContinue();
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("onboarding.saveError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">{tr("onboarding.testHint")}</p>
      {units.length === 0 ? (
        <p className="text-sm text-amber-200">{tr("onboarding.noResources")}</p>
      ) : (
        <Field label={tr("onboarding.testUnit")}>
          <select
            value={resourceId}
            onChange={(e) => setResourceId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none"
          >
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !resourceId}
          onClick={() => void startTest()}
          className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-40"
        >
          {tr("onboarding.startTest")}
        </button>
        <Link
          href={sessionsHref}
          className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-zinc-300"
        >
          {tr("onboarding.openSessions")}
        </Link>
      </div>
    </div>
  );
}

function StaffStep({
  busy,
  setBusy,
  setError,
  setMessage,
  tr,
  onContinue,
}: {
  busy: boolean;
  setBusy: (b: boolean) => void;
  setError: (e: string | null) => void;
  setMessage: (m: string | null) => void;
  tr: (k: string, v?: Record<string, string | number>) => string;
  onContinue: () => void;
}) {
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  async function invite(e: FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createStaff({
        username: username.trim(),
        name: name.trim() || undefined,
        role: "MANAGER",
      });
      setInviteUrl(res.activationUrl);
      setMessage(tr("onboarding.staffInvited"));
      onContinue();
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("onboarding.saveError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={(e) => void invite(e)}>
      <p className="text-sm text-zinc-400">{tr("onboarding.staffHint")}</p>
      <Field label={tr("onboarding.staffUsername")} required>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none"
          placeholder="manager"
        />
      </Field>
      <Field label={tr("onboarding.staffName")}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none"
        />
      </Field>
      {inviteUrl ? (
        <p className="break-all rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
          {tr("onboarding.staffInviteUrl")}: {inviteUrl}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <PrimaryButton busy={busy} label={tr("onboarding.inviteStaff")} />
        <button
          type="button"
          onClick={onContinue}
          className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-zinc-300"
        >
          {tr("onboarding.skipStaff")}
        </button>
      </div>
    </form>
  );
}

function PreviewStep({
  settings,
  setSettings,
  catalog,
  schedule,
  marketingUnlocked,
  subscriptionHref,
  busy,
  setBusy,
  setError,
  tr,
  onFinish,
}: {
  settings: ShopSettingsResponse;
  setSettings: (s: ShopSettingsResponse) => void;
  catalog: ResourceCatalog | null;
  schedule: VenueSchedule | null;
  marketingUnlocked: boolean;
  subscriptionHref: string;
  busy: boolean;
  setBusy: (b: boolean) => void;
  setError: (e: string | null) => void;
  tr: (k: string) => string;
  onFinish: () => void;
}) {
  const shop = settings.shop;
  const unitCount =
    catalog?.categories.reduce((n, c) => n + c.resources.length, 0) ?? 0;
  const hoursOk = (schedule?.weekly.length ?? 0) > 0;
  const publicUrl = `/venue/${encodeURIComponent(shop.slug)}`;

  async function togglePublish() {
    if (!marketingUnlocked) return;
    setBusy(true);
    setError(null);
    try {
      const next = await updateShopSettings({
        isPublished: !shop.isPublished,
      });
      setSettings(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("onboarding.saveError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">{tr("onboarding.previewHint")}</p>
      <ul className="space-y-2 rounded-xl border border-white/10 p-4 text-sm">
        <CheckRow ok={Boolean(shop.name)} label={tr("onboarding.check.name")} />
        <CheckRow ok={hoursOk} label={tr("onboarding.check.hours")} />
        <CheckRow
          ok={unitCount > 0}
          label={tr("onboarding.check.resources")}
        />
        <CheckRow ok={Boolean(shop.slug)} label={tr("onboarding.check.slug")} />
      </ul>
      <div className="flex flex-wrap gap-2">
        <a
          href={publicUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-zinc-200"
        >
          {tr("onboarding.openPublic")}
        </a>
        {marketingUnlocked ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void togglePublish()}
            className="rounded-lg border border-emerald-500/40 px-4 py-2.5 text-sm text-emerald-100"
          >
            {shop.isPublished
              ? tr("onboarding.unpublish")
              : tr("onboarding.publish")}
          </button>
        ) : (
          <Link
            href={subscriptionHref}
            className="rounded-lg border border-amber-500/40 px-4 py-2.5 text-sm text-amber-100"
          >
            {tr("onboarding.unlockPublish")}
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={onFinish}
        className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950"
      >
        {tr("onboarding.finish")}
      </button>
    </div>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-zinc-300">
      <span
        className={cn(
          "grid h-5 w-5 place-items-center rounded-full text-[10px]",
          ok ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-800 text-zinc-500",
        )}
      >
        {ok ? <Check size={12} /> : "·"}
      </span>
      {label}
    </li>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block text-xs text-zinc-400">
      {label}
      {required ? " *" : ""}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function PrimaryButton({ busy, label }: { busy: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-40"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {label}
    </button>
  );
}
