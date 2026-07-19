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
import { register } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/use-auth";
import { dashboardHref } from "@/lib/venue-dashboard";
import {
  TRIAL_DURATION_DAYS,
  VENUE_PACK_LIST,
  type VenuePackId,
} from "@/lib/venue-packs";

function passwordScore(p: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  let s = 0;
  if (p.length >= 10) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p) && p.length >= 12) s++;
  const labels = ["Weak", "Okay", "Good", "Strong", "Excellent"] as const;
  return { score: s as 0 | 1 | 2 | 3 | 4, label: labels[s] };
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

const STEPS = ["Account", "Venue", "Type"] as const;

export default function RegisterPage() {
  const router = useRouter();
  const { reload } = useAuth();

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
  const [packId, setPackId] = useState<VenuePackId>("gaming");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const score = useMemo(() => passwordScore(password), [password]);
  const effectiveSlug = slugTouched ? shopSlug : slugify(shopName);

  function validateStep(): string | null {
    if (step === 0) {
      if (!email.trim()) return "Email is required.";
      if (password !== confirm) return "Passwords do not match.";
      if (score.score < 2)
        return "Pick a stronger password (10+ chars, mix of cases & numbers).";
    }
    if (step === 1) {
      if (!shopName.trim()) return "Venue name is required.";
      if (!effectiveSlug) return "Venue URL slug is required.";
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
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function onSubmit() {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    if (!agreedToTerms) {
      setError("Please agree to the Terms of Service and Privacy Policy.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
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
      const base = session.dashboardPath ?? null;
      router.replace(
        base ? dashboardHref(base, "/subscription") : "/dashboard",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Create your venue"
      subtitle={`${TRIAL_DURATION_DAYS}-day free trial · choose your venue type, then pick features after signup.`}
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-emerald-400 transition hover:text-emerald-300"
          >
            Sign in
          </Link>
        </>
      }
    >
      <div className="mb-5 flex gap-1">
        {STEPS.map((label, i) => (
          <div key={label} className="min-w-0 flex-1">
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
              {label}
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
            <Field label="Your name">
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
            <Field label="Email">
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
          <Field label="Password">
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
              Strength: {score.label}
            </p>
          </Field>
          <Field label="Confirm password">
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
          <Field label="Venue name">
            <div className="relative">
              <Building2
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <input
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-zinc-950 py-2.5 pl-9 pr-3 text-sm text-white"
                placeholder="Neon Billiards"
              />
            </div>
          </Field>
          <Field label="Public URL slug">
            <input
              value={effectiveSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setShopSlug(slugify(e.target.value));
              }}
              className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 font-mono text-sm text-white"
            />
            <p className="mt-1 text-[11px] text-zinc-500">
              gospots.com/venue/{effectiveSlug || "…"}
            </p>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="City (optional)">
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white"
              />
            </Field>
            <Field label="Country (optional)">
              <input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white"
              />
            </Field>
          </div>
          <Field label="Phone (optional)">
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
            What kind of venue is this? No pricing here — you pick paid features
            on the next screen after your account is created.
          </p>
          {VENUE_PACK_LIST.map((pack) => {
            const active = pack.id === packId;
            return (
              <button
                key={pack.id}
                type="button"
                onClick={() => setPackId(pack.id)}
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
                  <span className="font-medium text-white">{pack.name}</span>
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    {pack.tagline}
                  </span>
                </span>
              </button>
            );
          })}
          <p className="pt-2 text-[11px] text-zinc-600">
            Free for {TRIAL_DURATION_DAYS} days. You can change venue type or
            features anytime.
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
              I agree to the{" "}
              <Link
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 underline-offset-2 hover:underline"
              >
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 underline-offset-2 hover:underline"
              >
                Privacy Policy
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
            Back
          </button>
        ) : null}
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={next}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Continue
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
              "Create venue"
            )}
          </button>
        )}
      </div>
    </AuthCard>
  );
}
