"use client";

import { Loader2, Mail } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AuthCard, Field } from "@/components/auth/auth-card";
import { requestOwnerPasswordReset } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDoneMessage(null);
    setLoading(true);
    try {
      const res = await requestOwnerPasswordReset(email.trim().toLowerCase());
      setDoneMessage(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Forgot password"
      subtitle="Owner accounts only. Staff cannot reset passwords here."
      footer={
        <>
          <Link
            href="/login"
            className="text-emerald-400 transition hover:text-emerald-300"
          >
            Back to owner sign in
          </Link>
        </>
      }
    >
      {doneMessage ? (
        <div className="space-y-4">
          <p className="rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-100">
            {doneMessage}
          </p>
          <Link
            href="/login"
            className="inline-flex text-sm text-emerald-400 hover:underline"
          >
            Return to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Field label="Owner email">
            <div className="relative">
              <Mail
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@venue.com"
                className="w-full rounded-lg border border-white/10 bg-zinc-900/60 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20"
              />
            </div>
          </Field>

          {error ? (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-400 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:opacity-60"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            {loading ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
    </AuthCard>
  );
}
