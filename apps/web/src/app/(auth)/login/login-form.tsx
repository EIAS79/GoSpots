"use client";

import { Loader2, Lock, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AuthCard, Field } from "@/components/auth/auth-card";
import { login } from "@/lib/auth-client";
import { dashboardBase } from "@/lib/venue-dashboard";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextParam = params.get("next");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const session = await login(email.trim().toLowerCase(), password);
      const home = session.dashboardPath
        ? dashboardBase(session.dashboardPath)
        : "/dashboard";
      const dest =
        nextParam &&
        session.dashboardPath &&
        nextParam.startsWith(`/dashboard/${session.dashboardPath}`)
          ? nextParam
          : home;
      router.push(dest);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Venue owner: your email · Staff: username@venue-slug.venueflow"
      footer={
        <>
          New here?{" "}
          <Link
            href="/register"
            className="text-emerald-400 transition hover:text-emerald-300"
          >
            Create your venue account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="Email or staff login">
          <div className="relative">
            <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@venue.com or anna@cue-cobra.venueflow"
              className="w-full rounded-lg border border-white/10 bg-zinc-900/60 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition focus:border-emerald-400/60 focus:bg-zinc-900/80 focus:ring-2 focus:ring-emerald-400/20"
            />
          </div>
        </Field>

        <Field label="Password">
          <div className="relative">
            <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={10}
              maxLength={128}
              className="w-full rounded-lg border border-white/10 bg-zinc-900/60 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition focus:border-emerald-400/60 focus:bg-zinc-900/80 focus:ring-2 focus:ring-emerald-400/20"
            />
          </div>
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
          {loading ? "Signing in…" : "Sign in"}
        </button>

        <p className="text-center text-[11px] text-zinc-600">
          Sessions use httpOnly cookies. 5 failed attempts → temporary lock.
        </p>
      </form>
    </AuthCard>
  );
}
