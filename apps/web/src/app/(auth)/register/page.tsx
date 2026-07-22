"use client";

import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Loader2,
  Lock,
  Mail,
  User,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AuthCard, Field } from "@/components/auth/auth-card";
import { ensureCsrf } from "@/lib/api";
import { register } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { usePublicPrefs } from "@/lib/public-prefs-context";
import { useAuth } from "@/lib/use-auth";
import { dashboardHref } from "@/lib/venue-dashboard";
import { ensureOnboardingProgress } from "@/lib/onboarding-progress";
import {
  SELF_SERVE_PACK_LIST,
  TRIAL_DURATION_DAYS,
  type SelfServePackId,
} from "@/lib/venue-packs";

function passwordScore(p: string): { score: 0 | 1 | 2 | 3 | 4 } {
  let s = 0;
  if (p.length >= 10) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p) && p.length >= 12) s++;
  return { score: s as 0 | 1 | 2 | 3 | 4 };
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

const STRENGTH_KEYS = [
  "auth.register.strength0",
  "auth.register.strength1",
  "auth.register.strength2",
  "auth.register.strength3",
  "auth.register.strength4",
] as const;

const STEP_KEYS = [
  "auth.register.stepAccount",
  "auth.register.stepVenue",
  "auth.register.stepType",
] as const;

export default function RegisterPage() {
  const router = useRouter();
  const { reload } = useAuth();
  const { t } = usePublicPrefs();

  const [step, setStep] = useState(0);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [shopName, setShopName] = useState("");
  const [shopSlug, setShopSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [phone, setPhone] = useState("");
  const [packId, setPackId] = useState<SelfServePackId>("gaming");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const score = useMemo(() => passwordScore(password), [password]);
  const effectiveSlug = slugTouched ? shopSlug : slugify(shopName);

  function validateStep(): string | null {
    if (step === 0) {
      if (!email.trim()) return t("auth.register.emailRequired");
      if (password !== confirm) return t("auth.register.passwordMismatch");
      if (score.score < 2) return t("auth.register.passwordWeak");
    }
    if (step === 1) {
      if (!shopName.trim()) return t("auth.register.venueNameRequired");
      if (!effectiveSlug) return t("auth.register.slugRequired");
    }
    return null;
  }

  function next() {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setStep((s) => Math.min(s + 1, STEP_KEYS.length - 1));
  }

  async function onSubmit() {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    if (!agreedToTerms) {
      setError(t("auth.register.agreeRequired"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await ensureCsrf();
      const session = await register({
        email: email.trim(),
        password,
        name: name.trim() || undefined,
        shopName: shopName.trim(),
        shopSlug: effectiveSlug,
        packId,
        addOns: [],
        venueType: packId,
        city: city.trim() || undefined,
        country: country.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      await reload();
      const base = session.venuePath ?? null;
      if (base) {
        ensureOnboardingProgress(base);
        router.replace(dashboardHref(base, "/onboarding"));
      } else {
        router.replace("/dashboard");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.register.failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title={t("auth.register.title")}
      subtitle={t("auth.register.subtitle", { days: TRIAL_DURATION_DAYS })}
      footer={
        <>
          {t("auth.register.alreadyHave")}{" "}
          <Link
            href="/login"
            className="text-emerald-400 transition hover:text-emerald-300"
          >
            {t("auth.register.signIn")}
          </Link>
        </>
      }
    >
      <div className="mb-5 flex gap-1">
        {STEP_KEYS.map((key, i) => (
          <div key={key} className="min-w-0 flex-1">
            <div
              className={cn(
                "h-1 rounded-full",
                i <= step ? "bg-emerald-500" : "bg-white/10",
              )}
            />
            <p
              className={cn(
                "mt-1 truncate text-[10px]",
                i === step ? "text-emerald-300" : "text-zinc-600",
              )}
            >
              {t(key)}
            </p>
          </div>
        ))}
      </div>

      {error ? (
        <p className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </p>
      ) : null}

      {step === 0 ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("auth.register.yourName")}>
              <div className="relative">
                <User
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-zinc-950 py-2.5 pl-9 pr-3 text-sm text-white"
                  autoComplete="name"
                />
              </div>
            </Field>
            <Field label={t("auth.register.email")}>
              <div className="relative">
                <Mail
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-zinc-950 py-2.5 pl-9 pr-3 text-sm text-white"
                  autoComplete="email"
                />
              </div>
            </Field>
          </div>
          <Field label={t("auth.register.password")}>
            <div className="relative">
              <Lock
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-zinc-950 py-2.5 pl-9 pr-3 text-sm text-white"
                autoComplete="new-password"
              />
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">
              {t("auth.register.strength", {
                label: t(STRENGTH_KEYS[score.score]),
              })}
            </p>
          </Field>
          <Field label={t("auth.register.confirmPassword")}>
            <input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white"
              autoComplete="new-password"
            />
          </Field>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="flex flex-col gap-4">
          <Field label={t("auth.register.venueName")}>
            <div className="relative">
              <Building2
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <input
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-zinc-950 py-2.5 pl-9 pr-3 text-sm text-white"
                placeholder={t("auth.register.venuePlaceholder")}
              />
            </div>
          </Field>
          <Field label={t("auth.register.slug")}>
            <input
              value={effectiveSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setShopSlug(slugify(e.target.value));
              }}
              className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 font-mono text-sm text-white"
            />
            <p className="mt-1 text-[11px] text-zinc-500">
              {t("auth.register.slugPreview", {
                slug: effectiveSlug || "…",
              })}
            </p>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("auth.register.cityOptional")}>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white"
              />
            </Field>
            <Field label={t("auth.register.countryOptional")}>
              <input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white"
              />
            </Field>
          </div>
          <Field label={t("auth.register.phoneOptional")}>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white"
            />
          </Field>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-2">
          <p className="mb-2 text-xs text-zinc-500">
            {t("auth.register.packHint")}
          </p>
          {SELF_SERVE_PACK_LIST.map((pack) => {
            const active = pack.id === packId;
            return (
              <button
                key={pack.id}
                type="button"
                onClick={() => setPackId(pack.id as SelfServePackId)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition",
                  active
                    ? "border-emerald-400/40 bg-emerald-500/10"
                    : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 grid h-5 w-5 place-items-center rounded-full border",
                    active
                      ? "border-emerald-400 bg-emerald-500 text-zinc-950"
                      : "border-white/20",
                  )}
                >
                  {active ? <Check size={12} /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-white">
                    {t(`pack.${pack.id}.name`)}
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    {t(`pack.${pack.id}.tagline`)}
                  </span>
                </span>
              </button>
            );
          })}
          <p className="pt-1 text-[11px] leading-relaxed text-zinc-500">
            {t("auth.register.contactSalesLead")}{" "}
            <a
              href="mailto:hello@locora.app"
              className="text-emerald-400 underline-offset-2 hover:underline"
            >
              {t("auth.register.contactSales")}
            </a>
            .
          </p>
          <p className="pt-2 text-[11px] text-zinc-600">
            {t("auth.register.trialNote", { days: TRIAL_DURATION_DAYS })}
          </p>
          <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3 text-xs leading-relaxed text-zinc-400">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-zinc-950 text-emerald-500 focus:ring-emerald-500/40"
              required
            />
            <span>
              {t("auth.register.agreeBefore")}{" "}
              <Link
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 underline-offset-2 hover:underline"
              >
                {t("auth.register.terms")}
              </Link>{" "}
              {t("auth.register.agreeAnd")}{" "}
              <Link
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 underline-offset-2 hover:underline"
              >
                {t("auth.register.privacy")}
              </Link>
              .
            </span>
          </label>
        </div>
      ) : null}

      <div className="mt-5 flex gap-2">
        {step > 0 ? (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setStep((s) => s - 1);
            }}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-white/10 py-2.5 text-sm text-zinc-300 hover:bg-white/5"
          >
            <ArrowLeft size={14} />
            {t("auth.register.back")}
          </button>
        ) : null}
        {step < STEP_KEYS.length - 1 ? (
          <button
            type="button"
            onClick={next}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-500"
          >
            {t("auth.register.continue")}
            <ArrowRight size={14} />
          </button>
        ) : (
          <button
            type="button"
            disabled={loading || !agreedToTerms}
            onClick={() => void onSubmit()}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              t("auth.register.createVenue")
            )}
          </button>
        )}
      </div>
    </AuthCard>
  );
}
