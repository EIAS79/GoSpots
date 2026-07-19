"use client";

import { Loader2, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthCard, Field } from "@/components/auth/auth-card";
import { resetOwnerPassword } from "@/lib/auth-client";

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError("Missing reset token. Request a new link from owner sign in.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await resetOwnerPassword(token, password);
      router.replace("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <AuthCard
        title="Invalid reset link"
        subtitle="This page needs a token from your reset email."
      >
        <Link
          href="/forgot-password"
          className="text-sm text-emerald-400 hover:underline"
        >
          Request a new owner reset link
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Set a new password"
      subtitle="Owner account only. Choose a new password for your venue login."
      footer={
        <Link
          href="/login"
          className="text-emerald-400 transition hover:text-emerald-300"
        >
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="New password">
          <div className="relative">
            <Lock
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <input
              type="password"
              required
              minLength={10}
              maxLength={128}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-zinc-900/60 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20"
            />
          </div>
        </Field>
        <Field label="Confirm password">
          <div className="relative">
            <Lock
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <input
              type="password"
              required
              minLength={10}
              maxLength={128}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
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
          {loading ? "Saving…" : "Update password"}
        </button>
      </form>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="h-[360px] w-full max-w-md animate-pulse rounded-3xl border border-white/10 bg-zinc-950/60" />
      }
    >
      <ResetForm />
    </Suspense>
  );
}
