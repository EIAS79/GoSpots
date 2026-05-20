"use client";

import { Building2, Loader2, Lock, Mail, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AuthCard, Field } from "@/components/auth/auth-card";
import { register } from "@/lib/auth-client";
import { dashboardBase } from "@/lib/venue-dashboard";
import { cn } from "@/lib/cn";

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

export default function RegisterPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [shopName, setShopName] = useState("");
  const [shopSlug, setShopSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const score = useMemo(() => passwordScore(password), [password]);
  const effectiveSlug = slugTouched ? shopSlug : slugify(shopName);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (score.score < 2) {
      setError("Pick a stronger password (10+ chars, mix of cases & numbers).");
      return;
    }
    setLoading(true);
    try {
      const session = await register({
        email: email.trim(),
        password,
        name: name.trim() || undefined,
        shopName: shopName.trim() || undefined,
        shopSlug: effectiveSlug || undefined,
      });
      router.push(
        session.dashboardPath
          ? dashboardBase(session.dashboardPath)
          : "/dashboard",
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Create your venue"
      subtitle="7-day Starter trial · no card required."
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
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Your name">
            <div className="relative">
              <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                placeholder="Marek"
                className="w-full rounded-lg border border-white/10 bg-zinc-900/60 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20"
              />
            </div>
          </Field>
          <Field label="Email">
            <div className="relative">
              <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-zinc-900/60 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20"
              />
            </div>
          </Field>
        </div>

        <Field label="Password" hint="10+ chars · upper/lower · number">
          <div className="relative">
            <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-zinc-900/60 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20"
            />
          </div>
          {password && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex h-1 flex-1 gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex-1 rounded-full transition",
                      i < score.score
                        ? score.score >= 3
                          ? "bg-emerald-400"
                          : score.score === 2
                            ? "bg-amber-400"
                            : "bg-rose-400"
                        : "bg-white/10",
                    )}
                  />
                ))}
              </div>
              <span className="text-[11px] text-zinc-500">{score.label}</span>
            </div>
          )}
        </Field>

        <Field label="Confirm password">
          <input
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20"
          />
        </Field>

        <div className="my-1 border-t border-white/5 pt-3">
          <p className="text-[11px] uppercase tracking-widest text-zinc-500">
            Your venue
          </p>
        </div>

        <Field label="Venue name">
          <div className="relative">
            <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              maxLength={120}
              placeholder="Cue & Cobra"
              className="w-full rounded-lg border border-white/10 bg-zinc-900/60 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20"
            />
          </div>
        </Field>

        <Field label="Public URL" hint={`venueflow.app/${effectiveSlug || "your-venue"}`}>
          <input
            value={shopSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setShopSlug(slugify(e.target.value));
            }}
            placeholder={slugify(shopName) || "your-venue"}
            className="w-full rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20"
          />
        </Field>

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-400 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:opacity-60"
        >
          {loading && <Loader2 size={14} className="animate-spin" />}
          {loading ? "Creating…" : "Create venue account"}
        </button>

        <p className="text-center text-[11px] text-zinc-600">
          Employees are added by you in the dashboard — they cannot register here.
          Each shop is isolated at the database level.
        </p>
      </form>
    </AuthCard>
  );
}
